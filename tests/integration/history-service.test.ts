import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { focusSession } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { deleteHistoryRecord, HISTORY_PAGE_SIZE, listHistory } from "@/server/history-service";
import { startSession } from "@/server/timer-service";
import { historyQuerySchema } from "@/validators/history";
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
const q = (raw: Record<string, unknown> = {}) => historyQuerySchema.parse(raw);

describe("filters", () => {
  it("filters by type, status, task and date range (inclusive, in the user's timezone)", async () => {
    await setTimezone(me, "Africa/Lagos");
    const t = await createTask(me, "Essay");
    await seedSession(me, { startedAt: "2026-03-01T09:00:00Z", taskId: t.id });
    await seedSession(me, { startedAt: "2026-03-02T09:00:00Z", type: "short_break" });
    await seedSession(me, { startedAt: "2026-03-03T09:00:00Z", status: "cancelled" });
    await seedSession(me, { startedAt: "2026-03-04T23:30:00Z" }); // 00:30 on Mar 5 in Lagos

    expect((await listHistory(me, q())).items).toHaveLength(4);
    expect((await listHistory(me, q({ type: "short_break" }))).items).toHaveLength(1);
    expect((await listHistory(me, q({ status: "cancelled" }))).items).toHaveLength(1);
    expect((await listHistory(me, q({ taskId: t.id }))).items.map((i) => i.taskTitle)).toEqual(["Essay"]);
    expect((await listHistory(me, q({ from: "2026-03-02", to: "2026-03-03" }))).items).toHaveLength(2);
    // Lagos-local Mar 5 includes the 23:30Z session; Mar 4 does not
    expect((await listHistory(me, q({ from: "2026-03-05", to: "2026-03-05" }))).items).toHaveLength(1);
    expect((await listHistory(me, q({ from: "2026-03-04", to: "2026-03-04" }))).items).toHaveLength(0);
  });

  it("returns newest first and never lists a live timer", async () => {
    await seedSession(me, { startedAt: "2026-03-01T09:00:00Z" });
    await seedSession(me, { startedAt: "2026-03-02T09:00:00Z" });
    await startSession(me, { type: "focus" });
    const { items } = await listHistory(me, q());
    expect(items).toHaveLength(2);
    expect(items[0].startedAt.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("paginates without gaps or repeats", async () => {
    for (let i = 0; i < HISTORY_PAGE_SIZE + 3; i++)
      await seedSession(me, { startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() });
    const p1 = await listHistory(me, q());
    const p2 = await listHistory(me, q({ page: 2 }));
    expect(p1.items).toHaveLength(HISTORY_PAGE_SIZE);
    expect(p1.hasMore).toBe(true);
    expect(p2.items).toHaveLength(3);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(HISTORY_PAGE_SIZE + 3);
  });

  it("drops invalid filters safely instead of failing", () => {
    expect(
      q({ from: "2026-02-30", to: "garbage", type: "nap", status: "x", taskId: "not-a-uuid", page: "-2" }),
    ).toEqual({
      from: undefined,
      to: undefined,
      type: undefined,
      status: undefined,
      taskId: undefined,
      page: 1,
    });
  });

  it("does not leak task titles across users even if a foreign task id is supplied", async () => {
    const other = await createUser();
    created.push(other);
    const theirs = await createTask(other, "Secret plan");
    await seedSession(me, { startedAt: "2026-03-01T09:00:00Z" });
    const { items } = await listHistory(me, q({ taskId: theirs.id }));
    expect(items).toEqual([]);
  });
});

describe("deleting records", () => {
  it("deletes my finished session", async () => {
    const s = await seedSession(me, { startedAt: "2026-03-01T09:00:00Z" });
    await deleteHistoryRecord(me, s.id);
    expect(await getDb().select().from(focusSession).where(eq(focusSession.id, s.id))).toHaveLength(0);
  });

  it("refuses another user's session and a live timer", async () => {
    const other = await createUser();
    created.push(other);
    const theirs = await seedSession(other, { startedAt: "2026-03-01T09:00:00Z" });
    const live = (await startSession(me, { type: "focus" })).active!;
    for (const id of [theirs.id, live.id]) {
      const err = await deleteHistoryRecord(me, id).then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("NOT_FOUND");
    }
    expect(
      await getDb()
        .select()
        .from(focusSession)
        .where(and(eq(focusSession.id, theirs.id))),
    ).toHaveLength(1);
    expect(await getDb().select().from(focusSession).where(eq(focusSession.id, live.id))).toHaveLength(1);
  });
});
