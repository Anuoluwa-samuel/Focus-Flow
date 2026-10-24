import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { focusSession, userPreferences } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  completeSession,
  getTimerState,
  pauseSession,
  resetSession,
  resumeSession,
  skipSession,
  startSession,
} from "@/server/timer-service";
import { createTask, createUser, deleteUser } from "../helpers/factories";

const t0 = new Date("2026-03-01T09:00:00.000Z");
const at = (s: number) => ({ now: new Date(t0.getTime() + s * 1000) });
const created: string[] = [];

let userId: string;
beforeEach(async () => {
  userId = await createUser();
  created.push(userId);
});
afterAll(async () => {
  for (const id of created) await deleteUser(id);
});

const rejects = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
};

describe("lifecycle", () => {
  it("starts a focus session using the user's configured duration", async () => {
    await getDb().update(userPreferences).set({ focusMinutes: 40 }).where(eq(userPreferences.userId, userId));
    const state = await startSession(userId, { type: "focus" }, at(0));
    expect(state.active).toMatchObject({ type: "focus", status: "running", plannedSeconds: 2400 });
  });

  it("pauses, resumes and completes with correct accumulated time, then reports a short break", async () => {
    const s = await startSession(userId, { type: "focus" }, at(0));
    const id = s.active!.id;
    const paused = await pauseSession(userId, id, at(600));
    expect(paused.active).toMatchObject({ status: "paused", accumulatedSeconds: 600 });
    const resumed = await resumeSession(userId, id, at(5000)); // 4400 s paused: must not count
    expect(resumed.active).toMatchObject({ status: "running", accumulatedSeconds: 600 });
    const done = await completeSession(userId, id, at(5000 + 900));
    expect(done.active).toBeNull();
    expect(done.ended).toMatchObject({ id, status: "completed", actualSeconds: 1500 });
    expect(done.nextType).toBe("short_break");
  });

  it("rejects early completion and keeps the timer running", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    await rejects(completeSession(userId, id, at(600)), "TOO_EARLY");
    expect((await getTimerState(userId, at(601))).active?.status).toBe("running");
  });

  it("reset and skip never count as completed focus", async () => {
    const a = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    await resetSession(userId, a, at(300));
    const b = (await startSession(userId, { type: "focus" }, at(400))).active!.id;
    const afterSkip = await skipSession(userId, b, at(700));
    expect(afterSkip.nextType).toBe("short_break"); // skip advances the cycle
    const rows = await getDb().select().from(focusSession).where(eq(focusSession.userId, userId));
    expect(rows.map((r) => r.status).sort()).toEqual(["cancelled", "skipped"]);
    expect(rows.every((r) => r.status !== "completed")).toBe(true);
  });

  it("suggests a long break after the 4th completed focus", async () => {
    let clock = 0;
    let state;
    for (let i = 0; i < 4; i++) {
      const id = (await startSession(userId, { type: "focus" }, at(clock))).active!.id;
      clock += 1500;
      state = await completeSession(userId, id, at(clock));
      clock += 10;
      if (i < 3) {
        const br = (await startSession(userId, { type: "short_break" }, at(clock))).active!.id;
        clock += 300;
        await completeSession(userId, br, at(clock));
        clock += 10;
      }
    }
    expect(state!.nextType).toBe("long_break");
  });
});

describe("invalid transitions", () => {
  it("cannot resume or pause in the wrong state, or touch an ended session", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    await rejects(resumeSession(userId, id, at(10)), "CONFLICT");
    await pauseSession(userId, id, at(20));
    await rejects(pauseSession(userId, id, at(30)), "CONFLICT");
    await resetSession(userId, id, at(40));
    await rejects(resumeSession(userId, id, at(50)), "CONFLICT");
    await rejects(completeSession(userId, id, at(5000)), "CONFLICT");
  });

  it("pausing at the planned end completes instead", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    const out = await pauseSession(userId, id, at(1500));
    expect(out.ended?.status).toBe("completed");
  });
});

describe("idempotency and concurrency", () => {
  it("repeated completion returns the same result and stores one record", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    const first = await completeSession(userId, id, at(1500));
    const second = await completeSession(userId, id, at(1600));
    expect(second.ended).toEqual(first.ended);
    const rows = await getDb().select().from(focusSession).where(eq(focusSession.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toEqual(new Date(t0.getTime() + 1500_000)); // the retry did not move the end time
  });

  it("10 simultaneous completions yield exactly one completed row and no errors", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => completeSession(userId, id, at(1500))));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const done = await getDb()
      .select()
      .from(focusSession)
      .where(and(eq(focusSession.userId, userId), eq(focusSession.status, "completed")));
    expect(done).toHaveLength(1);
  });

  it("10 simultaneous starts create exactly one live timer", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => startSession(userId, { type: "focus" }, at(0))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason instanceof AppError && r.reason.code === "CONFLICT")).toBe(true);
    const rows = await getDb().select().from(focusSession).where(eq(focusSession.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("the database itself refuses a second live row", async () => {
    await startSession(userId, { type: "focus" }, at(0));
    await expect(
      getDb()
        .insert(focusSession)
        .values({ userId, type: "focus", status: "paused", plannedSeconds: 600, accumulatedSeconds: 0 }),
    ).rejects.toThrow();
  });
});

describe("ownership", () => {
  it("another user cannot act on, or even learn about, someone else's session", async () => {
    const other = await createUser();
    created.push(other);
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    for (const fn of [pauseSession, resumeSession, completeSession, resetSession, skipSession]) {
      await rejects(fn(other, id, at(2000)), "NOT_FOUND");
    }
    expect((await getTimerState(other, at(1))).active).toBeNull();
    const [row] = await getDb().select().from(focusSession).where(eq(focusSession.id, id));
    expect(row.status).toBe("running");
  });

  it("cannot attach another user's task", async () => {
    const other = await createUser();
    created.push(other);
    const theirs = await createTask(other);
    await rejects(startSession(userId, { type: "focus", taskId: theirs.id }, at(0)), "NOT_FOUND");
    const mine = await createTask(userId);
    const s = await startSession(userId, { type: "focus", taskId: mine.id }, at(0));
    expect(s.active?.taskId).toBe(mine.id);
  });
});

describe("recovery", () => {
  it("abandons a timer left running far past its end without crediting it", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    const state = await getTimerState(userId, at(1500 + 7200));
    expect(state.active).toBeNull();
    expect(state.ended).toMatchObject({ id, status: "abandoned" });
    await rejects(completeSession(userId, id, at(1500 + 7300)), "CONFLICT");
  });

  it("a refresh shortly after the planned end still lets the client complete", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    const state = await getTimerState(userId, at(1500 + 120));
    expect(state.active?.status).toBe("running");
    const done = await completeSession(userId, id, at(1500 + 125));
    expect(done.ended?.status).toBe("completed");
  });

  it("a stale paused timer (24h+) is abandoned when a new session starts", async () => {
    const id = (await startSession(userId, { type: "focus" }, at(0))).active!.id;
    await pauseSession(userId, id, at(100));
    const next = await startSession(userId, { type: "focus" }, at(100 + 90000));
    expect(next.active?.id).not.toBe(id);
    expect(next.ended).toMatchObject({ id, status: "abandoned", actualSeconds: 100 });
  });
});

describe("constraints", () => {
  it("rejects impossible durations at the database level", async () => {
    await expect(
      getDb()
        .insert(focusSession)
        .values({ userId, type: "focus", status: "completed", plannedSeconds: 5, endedAt: new Date() }),
    ).rejects.toThrow();
  });
});
