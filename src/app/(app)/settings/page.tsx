import type { Metadata } from "next";
import { AccountSection } from "./account-section";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { getPreferences } from "@/server/preferences";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const p = await getPreferences(user.id);
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <PreferencesForm
        initial={{
          focusMinutes: p.focusMinutes,
          shortBreakMinutes: p.shortBreakMinutes,
          longBreakMinutes: p.longBreakMinutes,
          sessionsBeforeLongBreak: p.sessionsBeforeLongBreak,
          autoTransition: p.autoTransition,
          soundEnabled: p.soundEnabled,
          browserNotifications: p.browserNotifications,
          theme: p.theme,
          timezone: p.timezone,
          dailyGoalMinutes: p.dailyGoalMinutes ?? "",
        }}
      />
      <div className="mt-10 grid gap-6">
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>
        <AccountSection name={user.name} email={user.email} />
      </div>
    </main>
  );
}
