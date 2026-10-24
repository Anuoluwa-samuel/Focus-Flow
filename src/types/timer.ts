import type { SessionType, TimerStatus } from "@/domain/timer/machine";

/** Serializable timer data sent to the client. Dates are ISO strings. */
export type ActiveSessionDTO = {
  id: string;
  type: SessionType;
  status: "running" | "paused";
  plannedSeconds: number;
  accumulatedSeconds: number;
  lastResumedAt: string | null;
  taskId: string | null;
};

export type EndedSessionDTO = { id: string; type: SessionType; status: TimerStatus; actualSeconds: number };

export type TimerState = {
  active: ActiveSessionDTO | null;
  /** Server clock at response time; the client derives a skew from it and never trusts its own clock for elapsed time. */
  serverNow: string;
  nextType: SessionType;
  durations: Record<SessionType, number>; // seconds
  /** Set on the response to an event that ended a session (or when stale recovery abandoned one). */
  ended: EndedSessionDTO | null;
};
