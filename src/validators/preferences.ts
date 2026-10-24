import { z } from "zod";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const minutes = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

// Bounds mirror the CHECK constraints in src/db/schema/app.ts.
export const preferencesSchema = z
  .object({
    focusMinutes: minutes(1, 180, "Focus length"),
    shortBreakMinutes: minutes(1, 60, "Short break"),
    longBreakMinutes: minutes(1, 120, "Long break"),
    sessionsBeforeLongBreak: minutes(2, 12, "Sessions before long break"),
    autoTransition: z.boolean(),
    soundEnabled: z.boolean(),
    browserNotifications: z.boolean(),
    theme: z.enum(["system", "light", "dark"]),
    timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, "Choose a valid timezone"),
    dailyGoalMinutes: z
      .union([z.literal(""), z.null(), z.undefined(), minutes(5, 1440, "Daily goal")])
      .transform((v) => (v === "" || v == null ? null : v)),
  })
  .strict();

export type PreferencesInput = z.output<typeof preferencesSchema>;
export type PreferencesFormInput = z.input<typeof preferencesSchema>;

export const profileSchema = z.object({ name: z.string().trim().min(1, "Enter your name").max(80) });
