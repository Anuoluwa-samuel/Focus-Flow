import type { Metadata } from "next";
import { CompactTasks } from "@/components/tasks/compact-tasks";
import { Timer } from "@/components/timer/timer";
import { TodaySummaryCard } from "@/components/today-summary";
import { getTodaySummary } from "@/server/analytics-service";
import { getPreferences } from "@/server/preferences";
import { requireUser } from "@/server/session";
import { listOpenTasks } from "@/server/task-service";
import { getTimerState } from "@/server/timer-service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [initial, tasks, today, prefs] = await Promise.all([
    getTimerState(user.id),
    listOpenTasks(user.id),
    getTodaySummary(user.id),
    getPreferences(user.id),
  ]);
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-16">
      <Timer
        initial={initial}
        tasks={tasks}
        prefs={{
          soundEnabled: prefs.soundEnabled,
          browserNotifications: prefs.browserNotifications,
          autoTransition: prefs.autoTransition,
        }}
      />
      <TodaySummaryCard today={today} />
      <CompactTasks tasks={tasks} />
    </main>
  );
}
