import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { userPreferences } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { PreferencesInput } from "@/validators/preferences";

/** Reads (creating defaults if the row is somehow missing). Writes arrive with the settings page in Phase 4. */
export const getPreferences = cache(async (userId: string) => {
  const db = getDb();
  await db.insert(userPreferences).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  return row;
});

/** Explicit allow-list of writable columns; validation already happened in preferencesSchema. */
export async function updatePreferences(userId: string, input: PreferencesInput) {
  await getDb().insert(userPreferences).values({ userId }).onConflictDoNothing();
  const [row] = await getDb()
    .update(userPreferences)
    .set({
      focusMinutes: input.focusMinutes,
      shortBreakMinutes: input.shortBreakMinutes,
      longBreakMinutes: input.longBreakMinutes,
      sessionsBeforeLongBreak: input.sessionsBeforeLongBreak,
      autoTransition: input.autoTransition,
      soundEnabled: input.soundEnabled,
      browserNotifications: input.browserNotifications,
      theme: input.theme,
      timezone: input.timezone,
      dailyGoalMinutes: input.dailyGoalMinutes,
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, userId))
    .returning();
  return row;
}
