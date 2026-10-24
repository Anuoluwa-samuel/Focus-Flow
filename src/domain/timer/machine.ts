/**
 * Pure timer domain logic. No I/O, no clock access: every function receives `now`.
 * The database row is the source of truth; these functions derive everything from timestamps.
 */

export type TimerStatus = "running" | "paused" | "completed" | "cancelled" | "skipped" | "abandoned";
export type TimerEvent = "pause" | "resume" | "complete" | "reset" | "skip" | "abandon";
export type SessionType = "focus" | "short_break" | "long_break";

export const LIVE_STATUSES = ["running", "paused"] as const satisfies readonly TimerStatus[];

/** Server accepts completion this many seconds before the planned end (network/rounding slack). */
export const COMPLETION_TOLERANCE_SECONDS = 2;
/** A running timer this long past its planned end is treated as abandoned, not completed (user left). */
export const RUNNING_OVERRUN_GRACE_SECONDS = 60 * 60;
/** A paused timer untouched for this long is abandoned. */
export const PAUSED_MAX_SECONDS = 24 * 60 * 60;

export type TimerSnapshot = {
  status: TimerStatus;
  plannedSeconds: number;
  accumulatedSeconds: number;
  /** Set while running; the moment the current running slice began. */
  lastResumedAt: Date | null;
  /** Last state change; for a paused timer this is when it was paused. */
  updatedAt: Date;
};

export type TimerOutcome = {
  status: TimerStatus;
  accumulatedSeconds: number;
  lastResumedAt: Date | null;
  endedAt: Date | null;
  /** Final active seconds, only for terminal states. Never exceeds plannedSeconds. */
  actualSeconds: number | null;
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: TimerStatus,
    readonly event: TimerEvent,
  ) {
    super(`Cannot ${event} a ${from} timer`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<TimerStatus, Partial<Record<TimerEvent, TimerStatus>>> = {
  running: { pause: "paused", complete: "completed", reset: "cancelled", skip: "skipped", abandon: "abandoned" },
  paused: { resume: "running", reset: "cancelled", skip: "skipped", abandon: "abandoned" },
  completed: {},
  cancelled: {},
  skipped: {},
  abandoned: {},
};

export const isLive = (s: TimerStatus) => s === "running" || s === "paused";

export function nextStatus(from: TimerStatus, event: TimerEvent): TimerStatus {
  const to = TRANSITIONS[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

const wholeSecondsBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/** Active (unpaused) seconds so far. A clock that moved backwards yields 0 extra, never negative. */
export function activeSeconds(
  s: Pick<TimerSnapshot, "status" | "accumulatedSeconds" | "lastResumedAt">,
  now: Date,
): number {
  if (s.status === "running" && s.lastResumedAt) {
    return s.accumulatedSeconds + wholeSecondsBetween(s.lastResumedAt, now);
  }
  return s.accumulatedSeconds;
}

export function remainingSeconds(
  s: Pick<TimerSnapshot, "status" | "plannedSeconds" | "accumulatedSeconds" | "lastResumedAt">,
  now: Date,
): number {
  return Math.max(0, s.plannedSeconds - activeSeconds(s, now));
}

export function canComplete(s: TimerSnapshot, now: Date): boolean {
  return s.status === "running" && activeSeconds(s, now) >= s.plannedSeconds - COMPLETION_TOLERANCE_SECONDS;
}

/** What to do with a live timer nobody has touched: nothing, or abandon it. Never invents completion. */
export function staleness(s: TimerSnapshot, now: Date): "none" | "abandon" {
  if (s.status === "running" && s.lastResumedAt) {
    const plannedEnd = s.lastResumedAt.getTime() + (s.plannedSeconds - s.accumulatedSeconds) * 1000;
    if (now.getTime() - plannedEnd > RUNNING_OVERRUN_GRACE_SECONDS * 1000) return "abandon";
  }
  if (s.status === "paused" && wholeSecondsBetween(s.updatedAt, now) > PAUSED_MAX_SECONDS) return "abandon";
  return "none";
}

/**
 * Applies an event and returns the new persisted fields. Throws InvalidTransitionError for illegal moves
 * and for completion before the planned time has elapsed.
 */
export function applyEvent(s: TimerSnapshot, event: TimerEvent, now: Date): TimerOutcome {
  const to = nextStatus(s.status, event);
  const active = Math.min(activeSeconds(s, now), s.plannedSeconds);

  switch (event) {
    case "pause":
      return { status: to, accumulatedSeconds: active, lastResumedAt: null, endedAt: null, actualSeconds: null };
    case "resume":
      return {
        status: to,
        accumulatedSeconds: s.accumulatedSeconds,
        lastResumedAt: now,
        endedAt: null,
        actualSeconds: null,
      };
    case "complete": {
      if (!canComplete(s, now)) throw new InvalidTransitionError(s.status, event);
      // If the planned end passed while running, the session ended then, not when the client got around to asking.
      const plannedEnd =
        s.lastResumedAt && new Date(s.lastResumedAt.getTime() + (s.plannedSeconds - s.accumulatedSeconds) * 1000);
      const endedAt = plannedEnd && plannedEnd < now ? plannedEnd : now;
      return {
        status: to,
        accumulatedSeconds: s.plannedSeconds,
        lastResumedAt: null,
        endedAt,
        actualSeconds: s.plannedSeconds,
      };
    }
    case "reset":
    case "skip":
    case "abandon":
      return { status: to, accumulatedSeconds: active, lastResumedAt: null, endedAt: now, actualSeconds: active };
  }
}

export type NextTypeInput = {
  last: { type: SessionType; status: TimerStatus } | null;
  completedFocusSinceLongBreak: number;
  sessionsBeforeLongBreak: number;
};

/**
 * Suggested next session. A finished or skipped focus leads to a break (long on every Nth completed focus);
 * a break leads to focus; reset/abandoned sessions repeat the same type.
 */
export function nextSessionType({
  last,
  completedFocusSinceLongBreak,
  sessionsBeforeLongBreak,
}: NextTypeInput): SessionType {
  if (!last) return "focus";
  if (last.status === "cancelled" || last.status === "abandoned") return last.type;
  if (last.type !== "focus") return "focus";
  return completedFocusSinceLongBreak > 0 && completedFocusSinceLongBreak % sessionsBeforeLongBreak === 0
    ? "long_break"
    : "short_break";
}
