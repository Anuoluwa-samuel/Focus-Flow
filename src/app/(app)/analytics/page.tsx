import type { Metadata } from "next";
import Link from "next/link";
import { ColumnChart, RowChart, Stat } from "@/components/analytics/bar-chart";
import { addDays, eachDay, startOfIsoWeek } from "@/domain/dates";
import { formatDuration } from "@/domain/timer/format";
import { cn } from "@/lib/utils";
import { getAnalytics } from "@/server/analytics-service";
import { requireUser } from "@/server/session";
import { analyticsQuerySchema } from "@/validators/history";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [7, 14, 30, 90];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric" });

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const user = await requireUser();
  const raw = await searchParams;
  const { days } = analyticsQuerySchema.parse({ days: Array.isArray(raw.days) ? raw.days[0] : raw.days });
  const a = await getAnalytics(user.id, { days });
  const hasData = a.totals.sessions > 0;

  // Zero days inside the range are real zeros (no completed focus), but only drawn once there is any data at all.
  const dailyMap = new Map(a.daily.map((d) => [d.day, d]));
  const dailyBars = eachDay(a.from, a.to).map((day) => {
    const v = dailyMap.get(day);
    return {
      label: shortDay(day),
      value: v?.seconds ?? 0,
      valueLabel: v ? `${formatDuration(v.seconds)} (${v.sessions} sessions)` : "none",
    };
  });

  const weeklyMap = new Map(a.weekly.map((w) => [w.week, w]));
  const weekKeys = Array.from({ length: 8 }, (_, i) => addDays(startOfIsoWeek(a.to), -7 * (7 - i)));
  const weeklyBars = weekKeys.map((w) => {
    const v = weeklyMap.get(w);
    return {
      label: shortDay(w),
      value: v?.seconds ?? 0,
      valueLabel: v ? `${formatDuration(v.seconds)} (${v.sessions} sessions)` : "none",
    };
  });

  const best = [...a.weekdays].sort((x, y) => y.seconds - x.seconds);

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <nav aria-label="Date range" className="flex gap-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/analytics?days=${r}`}
              aria-current={r === days ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium",
                r === days ? "bg-accent-soft" : "text-muted hover:text-foreground",
              )}
            >
              {r} days
            </Link>
          ))}
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Focus time" value={formatDuration(a.totals.focusSeconds)} hint={`last ${days} days`} />
        <Stat label="Sessions" value={String(a.totals.sessions)} hint="completed focus" />
        <Stat
          label="Average"
          value={a.totals.avgSeconds === null ? "—" : formatDuration(a.totals.avgSeconds)}
          hint="per completed session"
        />
        <Stat
          label="Completion rate"
          value={a.totals.completionRate === null ? "—" : `${Math.round(a.totals.completionRate * 100)}%`}
          hint={
            a.totals.endedFocusSessions
              ? `${a.totals.sessions} of ${a.totals.endedFocusSessions} started`
              : "no finished sessions"
          }
        />
        <Stat label="Current streak" value={`${a.streak.current} ${a.streak.current === 1 ? "day" : "days"}`} />
        <Stat
          label="Best streak"
          value={`${a.streak.best} ${a.streak.best === 1 ? "day" : "days"}`}
          hint="last ~3 years"
        />
      </dl>

      {!hasData ? (
        <div className="mt-8 rounded-card border border-dashed border-border p-10 text-center">
          <p className="font-medium">No completed focus sessions in the last {days} days</p>
          <p className="mt-1 text-sm text-muted">
            Finish a focus session on the{" "}
            <Link className="underline" href="/dashboard">
              timer
            </Link>{" "}
            and your statistics will appear here. Skipped, reset and break sessions are not counted.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          <ColumnChart
            title={`Daily focus time (${a.timezone})`}
            bars={dailyBars}
            labelEvery={days > 30 ? 15 : days > 14 ? 5 : 1}
          />
          <ColumnChart title="Weekly focus time (weeks start Monday)" bars={weeklyBars} />
          <div className="grid gap-6 md:grid-cols-2">
            <RowChart
              title="Most productive days"
              rows={best.map((d) => ({
                label: WEEKDAYS[d.isoDow - 1],
                value: d.seconds,
                valueLabel: formatDuration(d.seconds),
              }))}
            />
            <RowChart
              title="Focus time by task"
              rows={a.byTask.map((t) => ({
                label: t.title ?? "No task",
                value: t.seconds,
                valueLabel: formatDuration(t.seconds),
              }))}
            />
          </div>
        </div>
      )}
      <p className="mt-8 text-xs text-muted">
        Focus time counts only completed focus sessions, on the day they started in your timezone ({a.timezone}).
        Breaks, skipped, reset and abandoned sessions are excluded.
      </p>
    </main>
  );
}
