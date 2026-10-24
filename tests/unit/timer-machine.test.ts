import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  activeSeconds,
  applyEvent,
  canComplete,
  nextSessionType,
  remainingSeconds,
  staleness,
  type TimerSnapshot,
} from "@/domain/timer/machine";
import { formatClock } from "@/domain/timer/format";

const t0 = new Date("2026-01-01T10:00:00.000Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

const running = (over: Partial<TimerSnapshot> = {}): TimerSnapshot => ({
  status: "running",
  plannedSeconds: 1500,
  accumulatedSeconds: 0,
  lastResumedAt: t0,
  updatedAt: t0,
  ...over,
});

describe("remaining time", () => {
  it("derives from timestamps, not ticks", () => {
    expect(remainingSeconds(running(), at(0))).toBe(1500);
    expect(remainingSeconds(running(), at(600))).toBe(900);
    expect(remainingSeconds(running(), at(5000))).toBe(0);
  });

  it("does not go negative if the clock moves backwards", () => {
    expect(activeSeconds(running(), at(-100))).toBe(0);
  });

  it("includes accumulated time from earlier slices and excludes paused time", () => {
    const resumed = running({ accumulatedSeconds: 300, lastResumedAt: at(1000) });
    expect(remainingSeconds(resumed, at(1100))).toBe(1500 - 300 - 100);
    const paused = running({ status: "paused", accumulatedSeconds: 300, lastResumedAt: null });
    expect(remainingSeconds(paused, at(99999))).toBe(1200);
  });
});

describe("pause / resume", () => {
  it("preserves elapsed time across pause and resume", () => {
    const paused = applyEvent(running(), "pause", at(400));
    expect(paused).toMatchObject({ status: "paused", accumulatedSeconds: 400, lastResumedAt: null });

    const resumed = applyEvent({ ...running(), ...paused, updatedAt: at(400) }, "resume", at(1400));
    expect(resumed).toMatchObject({ status: "running", accumulatedSeconds: 400, lastResumedAt: at(1400) });
    // 1000 s of pause did not count
    expect(remainingSeconds({ ...running(), ...resumed }, at(1400))).toBe(1100);
  });
});

describe("completion", () => {
  it("rejects completion before the planned time", () => {
    expect(canComplete(running(), at(1000))).toBe(false);
    expect(() => applyEvent(running(), "complete", at(1000))).toThrow(InvalidTransitionError);
  });

  it("allows a 2 second tolerance and caps credit at the planned duration", () => {
    expect(canComplete(running(), at(1498))).toBe(true);
    expect(canComplete(running(), at(1497))).toBe(false);
    const out = applyEvent(running(), "complete", at(1499));
    expect(out.actualSeconds).toBe(1500);
  });

  it("dates a late completion at the planned end, not at the request time", () => {
    const out = applyEvent(running(), "complete", at(1500 + 600));
    expect(out.endedAt).toEqual(at(1500));
    expect(out.actualSeconds).toBe(1500);
  });

  it("cannot complete while paused", () => {
    expect(() =>
      applyEvent(running({ status: "paused", lastResumedAt: null, accumulatedSeconds: 1500 }), "complete", at(2000)),
    ).toThrow(InvalidTransitionError);
  });
});

describe("state machine", () => {
  const terminal = ["completed", "cancelled", "skipped", "abandoned"] as const;
  const events = ["pause", "resume", "complete", "reset", "skip", "abandon"] as const;

  it.each(terminal.flatMap((s) => events.map((e) => [s, e] as const)))("%s rejects %s", (status, event) => {
    expect(() => applyEvent(running({ status, lastResumedAt: null }), event, at(2000))).toThrow(InvalidTransitionError);
  });

  it("cannot resume a running timer or pause a paused one", () => {
    expect(() => applyEvent(running(), "resume", at(10))).toThrow(InvalidTransitionError);
    expect(() => applyEvent(running({ status: "paused", lastResumedAt: null }), "pause", at(10))).toThrow(
      InvalidTransitionError,
    );
  });

  it("records partial time on reset and skip without completing", () => {
    expect(applyEvent(running(), "reset", at(300))).toMatchObject({ status: "cancelled", actualSeconds: 300 });
    expect(applyEvent(running(), "skip", at(300))).toMatchObject({ status: "skipped", actualSeconds: 300 });
  });
});

describe("staleness recovery", () => {
  it("leaves a normally running or recently overdue timer alone", () => {
    expect(staleness(running(), at(100))).toBe("none");
    expect(staleness(running(), at(1500 + 59 * 60))).toBe("none");
  });
  it("abandons a running timer an hour past its end instead of crediting it", () => {
    expect(staleness(running(), at(1500 + 3601))).toBe("abandon");
  });
  it("abandons a timer paused for more than a day", () => {
    const paused = running({ status: "paused", lastResumedAt: null, updatedAt: t0 });
    expect(staleness(paused, at(86400 - 1))).toBe("none");
    expect(staleness(paused, at(86400 + 2))).toBe("abandon");
  });
});

describe("next session type", () => {
  const base = { sessionsBeforeLongBreak: 4 };
  it("starts with focus", () =>
    expect(nextSessionType({ ...base, last: null, completedFocusSinceLongBreak: 0 })).toBe("focus"));
  it("gives a short break after focus 1-3 and a long break after the 4th", () => {
    for (const n of [1, 2, 3]) {
      expect(
        nextSessionType({ ...base, last: { type: "focus", status: "completed" }, completedFocusSinceLongBreak: n }),
      ).toBe("short_break");
    }
    expect(
      nextSessionType({ ...base, last: { type: "focus", status: "completed" }, completedFocusSinceLongBreak: 4 }),
    ).toBe("long_break");
  });
  it("returns to focus after any break, and repeats after reset", () => {
    expect(
      nextSessionType({ ...base, last: { type: "long_break", status: "completed" }, completedFocusSinceLongBreak: 0 }),
    ).toBe("focus");
    expect(
      nextSessionType({ ...base, last: { type: "focus", status: "cancelled" }, completedFocusSinceLongBreak: 2 }),
    ).toBe("focus");
  });
});

describe("formatClock", () => {
  it("formats minutes, hours, and rounds partial seconds up", () => {
    expect(formatClock(1500)).toBe("25:00");
    expect(formatClock(59.2)).toBe("01:00");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("00:00");
  });
});
