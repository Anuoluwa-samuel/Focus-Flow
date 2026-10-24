import "server-only";
import { and, desc, eq, gte, inArray, lt, ne, type SQL } from "drizzle-orm";
import { focusSession, task } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { addDays, normalizeTimeZone, startOfLocalDay } from "@/domain/dates";
import { getPreferences } from "./preferences";
import type { HistoryQuery } from "@/validators/history";

export const HISTORY_PAGE_SIZE = 25;

export async function listHistory(userId: string, q: HistoryQuery) {
  const tz = normalizeTimeZone((await getPreferences(userId)).timezone);
  const conds: SQL[] = [
    eq(focusSession.userId, userId),
    ne(focusSession.status, "running"),
    ne(focusSession.status, "paused"),
  ];
  // Date filters are local calendar days in the user's timezone, inclusive of both ends.
  if (q.from) conds.push(gte(focusSession.startedAt, startOfLocalDay(q.from, tz)));
  if (q.to) conds.push(lt(focusSession.startedAt, startOfLocalDay(addDays(q.to, 1), tz)));
  if (q.type) conds.push(eq(focusSession.type, q.type));
  if (q.status) conds.push(eq(focusSession.status, q.status));
  if (q.taskId) conds.push(eq(focusSession.taskId, q.taskId));

  const rows = await getDb()
    .select({
      id: focusSession.id,
      type: focusSession.type,
      status: focusSession.status,
      startedAt: focusSession.startedAt,
      plannedSeconds: focusSession.plannedSeconds,
      actualSeconds: focusSession.actualSeconds,
      taskId: focusSession.taskId,
      taskTitle: task.title,
    })
    .from(focusSession)
    .leftJoin(task, and(eq(task.id, focusSession.taskId), eq(task.userId, focusSession.userId)))
    .where(and(...conds))
    .orderBy(desc(focusSession.startedAt), desc(focusSession.id))
    .limit(HISTORY_PAGE_SIZE + 1)
    .offset((q.page - 1) * HISTORY_PAGE_SIZE);

  return {
    items: rows.slice(0, HISTORY_PAGE_SIZE),
    hasMore: rows.length > HISTORY_PAGE_SIZE,
    page: q.page,
    timezone: tz,
  };
}

/** Tasks for the filter dropdown (bounded). */
export async function listTaskOptions(userId: string) {
  return getDb()
    .select({ id: task.id, title: task.title })
    .from(task)
    .where(eq(task.userId, userId))
    .orderBy(desc(task.createdAt))
    .limit(100);
}

/** Users may delete their own finished sessions. A live timer is ended with reset/skip, never deleted. */
export async function deleteHistoryRecord(userId: string, id: string) {
  const rows = await getDb()
    .delete(focusSession)
    .where(
      and(
        eq(focusSession.id, id),
        eq(focusSession.userId, userId),
        inArray(focusSession.status, ["completed", "cancelled", "skipped", "abandoned"]),
      ),
    )
    .returning({ id: focusSession.id });
  if (rows.length === 0) throw new AppError("NOT_FOUND", "Session not found.");
}
