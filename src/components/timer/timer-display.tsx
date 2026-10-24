import { formatClock, SESSION_LABEL } from "@/domain/timer/format";
import type { SessionType } from "@/domain/timer/machine";

type Props = {
  type: SessionType;
  remainingSeconds: number;
  plannedSeconds: number;
  status: "idle" | "running" | "paused";
};

const R = 108;
const C = 2 * Math.PI * R;

/** Presentation only: all values are derived by the caller from server timestamps. */
export function TimerDisplay({ type, remainingSeconds, plannedSeconds, status }: Props) {
  const progress = plannedSeconds > 0 ? 1 - remainingSeconds / plannedSeconds : 0;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
      <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="120"
          cy="120"
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted">{SESSION_LABEL[type]}</p>
        {/* Not a live region: a ticking countdown must not be announced every second. */}
        <p data-testid="clock" className="font-mono text-6xl font-medium tabular-nums sm:text-7xl">
          {formatClock(remainingSeconds)}
        </p>
        <p className="text-sm text-muted">
          {status === "paused" ? "Paused" : status === "running" ? "In progress" : "Ready"}
        </p>
      </div>
    </div>
  );
}
