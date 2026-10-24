import { Flame } from "lucide-react";
import { formatDuration } from "@/domain/timer/format";
import type { TodaySummary } from "@/server/analytics-service";

export function TodaySummaryCard({ today }: { today: TodaySummary }) {
  const pct = today.goalSeconds ? Math.min(100, Math.round((today.focusSeconds / today.goalSeconds) * 100)) : null;
  return (
    <section
      aria-labelledby="today"
      className="mx-auto mt-12 w-full max-w-sm rounded-card border border-border bg-surface p-4"
    >
      <h2 id="today" className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">
        Today
      </h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-muted">Sessions</dt>
          <dd className="text-xl font-semibold tabular-nums">{today.sessions}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Focus time</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatDuration(today.focusSeconds)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Streak</dt>
          <dd className="flex items-center justify-center gap-1 text-xl font-semibold tabular-nums">
            <Flame className="size-4 text-accent" aria-hidden="true" />
            {today.streak.current}
            <span className="sr-only"> days</span>
          </dd>
        </div>
      </dl>
      {pct !== null && today.goalSeconds && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Daily goal</span>
            <span>
              {formatDuration(today.focusSeconds)} of {formatDuration(today.goalSeconds)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Daily goal progress"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 rounded-full bg-border"
          >
            <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Best streak: {today.streak.best} {today.streak.best === 1 ? "day" : "days"}
      </p>
    </section>
  );
}
