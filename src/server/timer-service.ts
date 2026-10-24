import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { focusSession, task, userPreferences } from "@/db/schema";
import { getDb, type Db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  InvalidTransitionError,
  LIVE_STATUSES,
  applyEvent,
  isLive,
  nextSessionType,
  staleness,
  type TimerEvent,
  type TimerSnapshot,
} from "@/domain/timer/machine";
import type { ActiveSessionDTO, EndedSessionDTO, TimerState } from "@/types/timer";
import type { StartInput } from "@/validators/timer";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = typeof focusSession.$inferSelect;
type Clock = { now?: Date };

const toSnapshot = (r: Row): TimerSnapshot => ({
  status: r.status,
  plannedSeconds: r.plannedSeconds,
  accumulatedSeconds: r.accumulatedSeconds,
  lastResumedAt: r.lastResumedAt,
  updatedAt: r.updatedAt,
});

const toActive = (r: Row): ActiveSessionDTO => ({
  id: r.id,
  type: r.type,
  status: r.status as "running" | "paused",
  plannedSeconds: r.plannedSeconds,
  accumulatedSeconds: r.accumulatedSeconds,
  lastResumedAt: r.lastResumedAt?.toISOString() ?? null,
  taskId: r.taskId,
});

const toEnded = (r: Row): EndedSessionDTO => ({
  id: r.id,
  type: r.type,
  status: r.status,
  actualSeconds: r.actualSeconds ?? 0,
});

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

async function loadPrefs(tx: Tx, userId: string) {
  await tx.insert(userPreferences).values({ userId }).onConflictDoNothing();
  const [p] = await tx.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  return p;
}

async function writeEvent(tx: Tx, row: Row, event: TimerEvent, now: Date): Promise<Row> {
  const out = applyEvent(toSnapshot(row), event, now);
  const [updated] = await tx
    .update(focusSession)
    .set({
      status: out.status,
      accumulatedSeconds: out.accumulatedSeconds,
      lastResumedAt: out.lastResumedAt,
      endedAt: out.endedAt,
      actualSeconds: out.actualSeconds,
      updatedAt: now,
    })
    .where(eq(focusSession.id, row.id))
    .returning();
  return updated;
}

/** Builds the response snapshot inside the same transaction as the mutation. */
async function buildState(tx: Tx, userId: string, now: Date, ended: Row | null = null): Promise<TimerState> {
  const prefs = await loadPrefs(tx, userId);
  const [live] = await tx
    .select()
    .from(focusSession)
    .where(and(eq(focusSession.userId, userId), inArray(focusSession.status, [...LIVE_STATUSES])));

  const [last] = await tx
    .select()
    .from(focusSession)
    .where(and(eq(focusSession.userId, userId), ne(focusSession.status, "running"), ne(focusSession.status, "paused")))
    .orderBy(desc(focusSession.endedAt))
    .limit(1);

  const [lastLong] = await tx
    .select({ endedAt: focusSession.endedAt })
    .from(focusSession)
    .where(
      and(
        eq(focusSession.userId, userId),
        eq(focusSession.type, "long_break"),
        inArray(focusSession.status, ["completed", "skipped"]),
      ),
    )
    .orderBy(desc(focusSession.endedAt))
    .limit(1);

  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(focusSession)
    .where(
      and(
        eq(focusSession.userId, userId),
        eq(focusSession.type, "focus"),
        eq(focusSession.status, "completed"),
        lastLong?.endedAt ? gt(focusSession.endedAt, lastLong.endedAt) : undefined,
      ),
    );

  return {
    active: live ? toActive(live) : null,
    serverNow: now.toISOString(),
    nextType: nextSessionType({
      last: last ? { type: last.type, status: last.status } : null,
      completedFocusSinceLongBreak: count,
      sessionsBeforeLongBreak: prefs.sessionsBeforeLongBreak,
    }),
    durations: {
      focus: prefs.focusMinutes * 60,
      short_break: prefs.shortBreakMinutes * 60,
      long_break: prefs.longBreakMinutes * 60,
    },
    ended: ended ? toEnded(ended) : null,
  };
}

/** Abandons a stale live timer (see domain `staleness`). Returns the abandoned row, if any. */
async function recoverStale(tx: Tx, userId: string, now: Date): Promise<Row | null> {
  const [live] = await tx
    .select()
    .from(focusSession)
    .where(and(eq(focusSession.userId, userId), inArray(focusSession.status, [...LIVE_STATUSES])))
    .for("update");
  if (live && staleness(toSnapshot(live), now) === "abandon") return writeEvent(tx, live, "abandon", now);
  return null;
}

async function lockOwned(tx: Tx, userId: string, sessionId: string): Promise<Row> {
  const [row] = await tx
    .select()
    .from(focusSession)
    .where(and(eq(focusSession.id, sessionId), eq(focusSession.userId, userId)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND", "Session not found.");
  return row;
}

/** Current timer state. Recovers (abandons) a stale timer first, so a long-closed tab never claims credit. */
export async function getTimerState(userId: string, { now = new Date() }: Clock = {}): Promise<TimerState> {
  return getDb().transaction(async (tx) => {
    const abandoned = await recoverStale(tx, userId, now);
    return buildState(tx, userId, now, abandoned);
  });
}

export async function startSession(
  userId: string,
  input: StartInput,
  { now = new Date() }: Clock = {},
): Promise<TimerState> {
  try {
    return await getDb().transaction(async (tx) => {
      const abandoned = await recoverStale(tx, userId, now);
      const prefs = await loadPrefs(tx, userId);

      if (input.taskId) {
        // Ownership check: the task must belong to the caller.
        const [t] = await tx
          .select({ id: task.id })
          .from(task)
          .where(and(eq(task.id, input.taskId), eq(task.userId, userId), isNull(task.archivedAt)));
        if (!t) throw new AppError("NOT_FOUND", "Task not found.");
      }

      const minutes = {
        focus: prefs.focusMinutes,
        short_break: prefs.shortBreakMinutes,
        long_break: prefs.longBreakMinutes,
      }[input.type];
      await tx.insert(focusSession).values({
        userId,
        taskId: input.type === "focus" ? (input.taskId ?? null) : null,
        type: input.type,
        status: "running",
        startedAt: now,
        lastResumedAt: now,
        plannedSeconds: minutes * 60,
        updatedAt: now,
        createdAt: now,
      });
      return buildState(tx, userId, now, abandoned);
    });
  } catch (err) {
    // Partial unique index `focus_session_one_live_per_user`: another start won the race.
    if (pgCode(err) === "23505") throw new AppError("CONFLICT", "A timer is already running.");
    throw err;
  }
}

async function transition(
  userId: string,
  sessionId: string,
  event: TimerEvent,
  { now = new Date() }: Clock,
): Promise<TimerState> {
  return getDb().transaction(async (tx) => {
    let row = await lockOwned(tx, userId, sessionId);

    // Completion is idempotent: repeating it after success returns the stored result, never a second record.
    if (event === "complete" && row.status === "completed") return buildState(tx, userId, now, row);

    if (isLive(row.status) && staleness(toSnapshot(row), now) === "abandon") {
      row = await writeEvent(tx, row, "abandon", now);
      return buildState(tx, userId, now, row); // user sees "session expired"; nothing was credited
    }

    try {
      // Pausing at or past the planned end is a completion, not a pause that could never be completed.
      let effective = event;
      if (event === "pause" && applyIsDue(row, now)) effective = "complete";
      row = await writeEvent(tx, row, effective, now);
      return buildState(tx, userId, now, isLive(row.status) ? null : row);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        if (event === "complete" && row.status === "running") {
          throw new AppError("TOO_EARLY", "The session has not reached its planned time yet.");
        }
        throw new AppError("CONFLICT", `This session is already ${row.status}.`);
      }
      throw err;
    }
  });
}

function applyIsDue(row: Row, now: Date): boolean {
  try {
    applyEvent(toSnapshot(row), "complete", now);
    return true;
  } catch {
    return false;
  }
}

export const pauseSession = (userId: string, sessionId: string, clock: Clock = {}) =>
  transition(userId, sessionId, "pause", clock);
export const resumeSession = (userId: string, sessionId: string, clock: Clock = {}) =>
  transition(userId, sessionId, "resume", clock);
export const completeSession = (userId: string, sessionId: string, clock: Clock = {}) =>
  transition(userId, sessionId, "complete", clock);
export const resetSession = (userId: string, sessionId: string, clock: Clock = {}) =>
  transition(userId, sessionId, "reset", clock);
export const skipSession = (userId: string, sessionId: string, clock: Clock = {}) =>
  transition(userId, sessionId, "skip", clock);
