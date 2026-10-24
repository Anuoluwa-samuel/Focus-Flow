import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  eachDay,
  isDateKey,
  localDateKey,
  normalizeTimeZone,
  startOfIsoWeek,
  startOfLocalDay,
} from "@/domain/dates";
import { computeStreaks } from "@/domain/streaks";

describe("localDateKey", () => {
  it("buckets the same instant into different days by timezone", () => {
    const t = new Date("2026-03-01T23:30:00Z");
    expect(localDateKey(t, "UTC")).toBe("2026-03-01");
    expect(localDateKey(t, "Africa/Lagos")).toBe("2026-03-02"); // UTC+1
    expect(localDateKey(t, "America/Los_Angeles")).toBe("2026-03-01"); // UTC-8
    expect(localDateKey(t, "Asia/Kolkata")).toBe("2026-03-02"); // UTC+5:30
    expect(localDateKey(t, "Pacific/Auckland")).toBe("2026-03-02");
  });
  it("a session crossing midnight belongs to the day it started", () => {
    expect(localDateKey(new Date("2026-03-01T22:50:00Z"), "Africa/Lagos")).toBe("2026-03-01"); // 23:50 local
  });
});

describe("startOfLocalDay", () => {
  it.each([
    ["2026-03-02", "UTC", "2026-03-02T00:00:00.000Z"],
    ["2026-03-02", "Africa/Lagos", "2026-03-01T23:00:00.000Z"],
    ["2026-03-02", "Asia/Kolkata", "2026-03-01T18:30:00.000Z"],
    ["2026-03-02", "America/Los_Angeles", "2026-03-02T08:00:00.000Z"],
  ])("%s in %s starts at %s", (key, tz, iso) => expect(startOfLocalDay(key, tz).toISOString()).toBe(iso));

  it("handles daylight-saving transitions (23h and 25h days)", () => {
    // US spring forward 2026-03-08: day is 23h long
    const a = startOfLocalDay("2026-03-08", "America/New_York");
    const b = startOfLocalDay("2026-03-09", "America/New_York");
    expect(a.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(b.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect((b.getTime() - a.getTime()) / 3600_000).toBe(23);
    // US fall back 2026-11-01: day is 25h long
    const c = startOfLocalDay("2026-11-01", "America/New_York");
    const d = startOfLocalDay("2026-11-02", "America/New_York");
    expect((d.getTime() - c.getTime()) / 3600_000).toBe(25);
  });

  it("round-trips with localDateKey", () => {
    for (const tz of ["UTC", "Africa/Lagos", "Asia/Kolkata", "America/New_York", "Pacific/Auckland", "Europe/London"]) {
      const start = startOfLocalDay("2026-10-25", tz);
      expect(localDateKey(start, tz)).toBe("2026-10-25");
      expect(localDateKey(new Date(start.getTime() - 1000), tz)).toBe("2026-10-24");
    }
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("finds the ISO week start (Monday)", () => {
    expect(startOfIsoWeek("2026-03-01")).toBe("2026-02-23"); // Sunday
    expect(startOfIsoWeek("2026-03-02")).toBe("2026-03-02"); // Monday
  });
  it("counts and lists days", () => {
    expect(daysBetween("2026-03-01", "2026-03-08")).toBe(7);
    expect(eachDay("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
  it("validates date keys including impossible dates", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("tomorrow")).toBe(false);
  });
  it("normalizes unknown or hostile timezone strings to UTC", () => {
    expect(normalizeTimeZone("Africa/Lagos")).toBe("Africa/Lagos");
    expect(normalizeTimeZone("Mars/Base")).toBe("UTC");
    expect(normalizeTimeZone("UTC'; drop table task; --")).toBe("UTC");
  });
});

describe("computeStreaks", () => {
  it("is zero with no data", () => expect(computeStreaks([], "2026-03-10")).toEqual({ current: 0, best: 0 }));
  it("counts consecutive days ending today", () => {
    expect(computeStreaks(["2026-03-08", "2026-03-09", "2026-03-10"], "2026-03-10")).toEqual({ current: 3, best: 3 });
  });
  it("keeps the streak alive when today has no session yet", () => {
    expect(computeStreaks(["2026-03-08", "2026-03-09"], "2026-03-10")).toEqual({ current: 2, best: 2 });
  });
  it("breaks the current streak after a missed day but remembers the best", () => {
    expect(
      computeStreaks(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-09"], "2026-03-10"),
    ).toEqual({ current: 1, best: 4 });
    expect(computeStreaks(["2026-03-01", "2026-03-02"], "2026-03-10")).toEqual({ current: 0, best: 2 });
  });
  it("ignores duplicates and input order, and spans month boundaries", () => {
    expect(computeStreaks(["2026-03-01", "2026-02-28", "2026-03-01", "2026-02-27"], "2026-03-01")).toEqual({
      current: 3,
      best: 3,
    });
  });
});
