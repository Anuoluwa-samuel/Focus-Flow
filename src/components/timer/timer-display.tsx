"use client";

// Client component: it hands a colour function to CircleProgress, and functions cannot cross from a server component
// (the landing page renders this preview on the server).
import { formatClock, SESSION_LABEL } from "@/domain/timer/format";
import type { SessionType } from "@/domain/timer/machine";
import { CircleProgress } from "@/components/ui/circle-progress";

type Props = {
  type: SessionType;
  remainingSeconds: number;
  plannedSeconds: number;
  status: "idle" | "running" | "paused";
};

/** Presentation only: all values are derived by the caller from server timestamps. */
export function TimerDisplay({ type, remainingSeconds, plannedSeconds, status }: Props) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
      {/* Decorative ring: the time and state are already in the text below, and a changing progressbar value
          must not be announced by screen readers, so it is hidden from assistive technology. */}
      <CircleProgress
        aria-hidden="true"
        value={remainingSeconds}
        maxValue={Math.max(plannedSeconds, 1)}
        size={240}
        strokeWidth={6}
        counterClockwise
        disableAnimation
        getColor={() => "stroke-accent"}
        className="absolute inset-0 [&_svg]:size-full"
      />
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
