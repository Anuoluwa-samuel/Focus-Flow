import type { TimerStatus } from "./machine";

/**
 * Whether to start the next session automatically after one ends.
 * Only when the user opted in, the session was completed by running out (not reset/skipped), and this page
 * actually watched it run. A tab reopened hours later must never start a session on its own.
 */
export function shouldAutoAdvance(input: {
  autoTransition: boolean;
  endedStatus: TimerStatus | undefined;
  watchedLive: boolean;
}): boolean {
  return input.autoTransition && input.endedStatus === "completed" && input.watchedLive;
}
