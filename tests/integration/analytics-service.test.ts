import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAnalytics, getStreaks, getTodaySummary } from "@/server/analytics-service";
import { createTask, createUser, deleteUser, seedSession, setTimezone } from "../helpers/factories";

const created: string[] = [];
let me: string;
beforeEach(async () => {
  me = await createUser();
  created.push(me);
});
afterAll(async () => {
  for (const id of created) await deleteUser(id);
});

// "now" = Wed 2026-03-11 12:00 UTC
const now = new Date("2026-03-11T12:00:00Z");
const run = (days = 14) => getAnalytics(me, { days }, { now });

describe("definitions", () => {
  it("counts only completed focus sessions as focus time", async () => {
    await seedSession(me, { startedAt: "2026-03-10T09:00:00Z", seconds: 1500 }); // counts
    await seedSession(me, { startedAt: "2026-03-10T10:00:00Z", seconds: 1500, type: "short_break" }); // break
    await seedSession(me, { startedAt: "2026-03-10T11:00:00Z", seconds: 600, status: "cancelled" });
    await seedSession(me, { startedAt: "2026-03-10T12:00:00Z", seconds: 300, status: "skipped" });
    await seedSession(me, { startedAt: "2026-03-10T13:00:00Z", seconds: 900, status: "abandoned" });
    const a = await run();
    expect(a.totals).toMatchObject({ sessions: 1, focusSeconds: 1500, avgSeconds: 1500, endedFocusSessions: 4 });
    expect(a.totals.completionRate).toBeCloseTo(0.25);
    expect(a.daily).toEqual([{ day: "2026-03-10", seconds: 1500, sessions: 1 }]);
  });

  it("averages completed sessions and reports no averages or rates without data", async () => {
    const empty = await run();
    expect(empty.totals).toMatchObject({ sessions: 0, focusSeconds: 0, avgSeconds: null, completionRate: null });
    expect(empty.daily).toEqual([]);
    expect(empty.byTask).toEqual([]);
    expect(empty.streak).toEqual({ current: 0, best: 0 });

    await seedSession(me, { startedAt: "2026-03-09T09:00:00Z", seconds: 1500 });
    await seedSession(me, { startedAt: "2026-03-09T10:00:00Z", seconds: 3000 });
    expect((await run()).totals.avgSeconds).toBe(2250);
  });

  it("respects the selected range", async () => {
    await seedSession(me, { startedAt: "2026-03-10T09:00:00Z" });
    await seedSession(me, { startedAt: "2026-03-01T09:00:00Z" });
    expect((await run(7)).totals.sessions).toBe(1);
    expect((await run(14)).totals.sessions).toBe(2);
  });
});

describe("timezones and date boundaries", () => {
  it("assigns a late-evening UTC session to the next local day for UTC+1, and the same day for UTC", async () => {
    await seedSession(me, { startedAt: "2026-03-10T23:30:00Z" });
    expect((await run()).daily.map((d) => d.day)).toEqual(["2026-03-10"]);
    await setTimezone(me, "Africa/Lagos");
    expect((await run()).daily.map((d) => d.day)).toEqual(["2026-03-11"]);
    await setTimezone(me, "America/Los_Angeles");
    expect((await run()).daily.map((d) => d.day)).toEqual(["2026-03-10"]);
  });

  it("a session that starts before and ends after local midnight counts once, on its start day", async () => {
    await setTimezone(me, "Africa/Lagos");
    await seedSession(me, { startedAt: "2026-03-10T22:50:00Z", seconds: 1500 }); // 23:50 local -> 00:15
    const a = await run();
    expect(a.daily).toEqual([{ day: "2026-03-10", seconds: 1500, sessions: 1 }]);
  });

  it("'today' follows the user's timezone, not the server's", async () => {
    await seedSession(me, { startedAt: "2026-03-11T00:30:00Z", seconds: 1500 });
    await setTimezone(me, "America/Los_Angeles", 60); //
    // In Los Angeles `now` is Mar 11 05:00, and the 00:30Z session happened on Mar 10 at 16:30: yesterday.
    expect((await getTodaySummary(me, { now })).sessions).toBe(0);
    await setTimezone(me, "UTC", 60);
    expect(await getTodaySummary(me, { now })).toMatchObject({ sessions: 1, focusSeconds: 1500, goalSeconds: 3600 });
  });
});

describe("breakdowns", () => {
  it("groups focus time by task, with unassigned sessions separate", async () => {
    const a = await createTask(me, "Essay");
    const b = await createTask(me, "Code");
    await seedSession(me, { startedAt: "2026-03-10T08:00:00Z", seconds: 1500, taskId: a.id });
    await seedSession(me, { startedAt: "2026-03-10T09:00:00Z", seconds: 1500, taskId: a.id });
    await seedSession(me, { startedAt: "2026-03-10T10:00:00Z", seconds: 3000, taskId: b.id });
    await seedSession(me, { startedAt: "2026-03-10T11:00:00Z", seconds: 600 });
    await seedSession(me, { startedAt: "2026-03-10T12:00:00Z", seconds: 900, taskId: a.id, status: "cancelled" });
    const { byTask } = await run();
    // Essay: 2 completed (the cancelled one is ignored). Ties on seconds are ordered by title.
    expect(byTask.map((t) => [t.title, t.seconds, t.sessions])).toEqual([
      ["Code", 3000, 1],
      ["Essay", 3000, 2],
      [null, 600, 1],
    ]);
  });

  it("finds the most productive weekdays (ISO Monday=1)", async () => {
    await seedSession(me, { startedAt: "2026-03-09T09:00:00Z", seconds: 3000 }); // Mon
    await seedSession(me, { startedAt: "2026-03-10T09:00:00Z", seconds: 1500 }); // Tue
    await seedSession(me, { startedAt: "2026-03-02T09:00:00Z", seconds: 1500 }); // Mon
    const { weekdays } = await run();
    expect(weekdays).toEqual([
      { isoDow: 1, seconds: 4500, sessions: 2 },
      { isoDow: 2, seconds: 1500, sessions: 1 },
    ]);
  });

  it("buckets weeks starting Monday", async () => {
    await seedSession(me, { startedAt: "2026-03-08T09:00:00Z", seconds: 1500 }); // Sun -> week of Mar 2
    await seedSession(me, { startedAt: "2026-03-09T09:00:00Z", seconds: 1500 }); // Mon -> week of Mar 9
    await seedSession(me, { startedAt: "2026-03-10T09:00:00Z", seconds: 1500 });
    expect((await run()).weekly).toEqual([
      { week: "2026-03-02", seconds: 1500, sessions: 1 },
      { week: "2026-03-09", seconds: 3000, sessions: 2 },
    ]);
  });
});

describe("streaks", () => {
  it("computes current and best streaks from completed focus days only", async () => {
    for (const d of ["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"])
      await seedSession(me, { startedAt: `${d}T09:00:00Z` });
    for (const d of ["2026-03-10", "2026-03-11"]) await seedSession(me, { startedAt: `${d}T09:00:00Z` });
    await seedSession(me, { startedAt: "2026-03-09T09:00:00Z", status: "cancelled" }); // does not bridge the gap
    await seedSession(me, { startedAt: "2026-03-08T09:00:00Z", type: "short_break" });
    expect(await getStreaks(me, { now })).toEqual({ current: 2, best: 4 });
  });
});

describe("isolation", () => {
  it("never includes another user's sessions", async () => {
    const other = await createUser();
    created.push(other);
    await seedSession(other, { startedAt: "2026-03-10T09:00:00Z", seconds: 9999 });
    const a = await run();
    expect(a.totals.sessions).toBe(0);
    expect(a.byTask).toEqual([]);
    expect((await getTodaySummary(me, { now })).sessions).toBe(0);
  });
});
