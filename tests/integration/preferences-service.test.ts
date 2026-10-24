import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPreferences, updatePreferences } from "@/server/preferences";
import { startSession } from "@/server/timer-service";
import { preferencesSchema } from "@/validators/preferences";
import { createUser, deleteUser } from "../helpers/factories";

const created: string[] = [];
let me: string;
beforeEach(async () => {
  me = await createUser();
  created.push(me);
});
afterAll(async () => {
  for (const id of created) await deleteUser(id);
});

const valid = (over = {}) =>
  preferencesSchema.parse({
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 20,
    sessionsBeforeLongBreak: 3,
    autoTransition: true,
    soundEnabled: false,
    browserNotifications: false,
    theme: "dark",
    timezone: "Africa/Lagos",
    dailyGoalMinutes: "120",
    ...over,
  });

describe("preferences", () => {
  it("returns defaults for a new user", async () => {
    expect(await getPreferences(me)).toMatchObject({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      sessionsBeforeLongBreak: 4,
      theme: "system",
      timezone: "UTC",
      dailyGoalMinutes: null,
    });
  });

  it("persists updates and new sessions use the saved durations", async () => {
    await updatePreferences(me, valid());
    expect(await getPreferences(me)).toMatchObject({
      focusMinutes: 50,
      theme: "dark",
      timezone: "Africa/Lagos",
      dailyGoalMinutes: 120,
      autoTransition: true,
    });
    const s = await startSession(me, { type: "focus" });
    expect(s.active?.plannedSeconds).toBe(3000);
    expect(s.durations).toMatchObject({ focus: 3000, short_break: 600, long_break: 1200 });
  });

  it("a user's update never touches another user's row", async () => {
    const other = await createUser();
    created.push(other);
    await updatePreferences(me, valid());
    expect((await getPreferences(other)).focusMinutes).toBe(25);
  });

  it("the database refuses out-of-range values even if validation is bypassed", async () => {
    const bad = { ...valid(), focusMinutes: 9999 };
    await expect(updatePreferences(me, bad)).rejects.toThrow();
    expect((await getPreferences(me)).focusMinutes).toBe(25);
  });

  it("changing durations does not alter a session that is already running", async () => {
    const s = await startSession(me, { type: "focus" });
    await updatePreferences(me, valid());
    const { getTimerState } = await import("@/server/timer-service");
    expect((await getTimerState(me)).active).toMatchObject({ id: s.active!.id, plannedSeconds: 1500 });
  });
});
