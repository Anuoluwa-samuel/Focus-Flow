import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { focusSession, task } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  createTask,
  deleteTask,
  listOpenTasks,
  listTasks,
  setTaskArchived,
  setTaskDone,
  TASKS_PAGE_SIZE,
  updateTask,
} from "@/server/task-service";
import { completeSession, startSession } from "@/server/timer-service";
import { createUser, deleteUser } from "../helpers/factories";

const created: string[] = [];
let me: string;
let other: string;
beforeEach(async () => {
  me = await createUser();
  other = await createUser();
  created.push(me, other);
});
afterAll(async () => {
  for (const id of created) await deleteUser(id);
});

const input = (title: string, extra = {}) => ({ title, description: null, priority: null, dueDate: null, ...extra });
const q = (over = {}) => ({ status: "open" as const, priority: undefined, page: 1, ...over });
const code = async (p: Promise<unknown>) =>
  (await p.then(
    () => null,
    (e) => e,
  )) as AppError | null;

describe("task CRUD", () => {
  it("creates, edits, completes, reopens, archives and deletes", async () => {
    const t = await createTask(me, input("Draft essay", { priority: "high", dueDate: "2026-12-01" }));
    expect(t).toMatchObject({ userId: me, status: "open", priority: "high" });
    expect(t.dueAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");

    const edited = await updateTask(me, { id: t.id, title: "Draft essay v2", description: "intro first" });
    expect(edited).toMatchObject({ title: "Draft essay v2", description: "intro first", priority: "high" }); // untouched fields kept

    const done = await setTaskDone(me, t.id, true);
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await setTaskDone(me, t.id, false);
    expect(reopened).toMatchObject({ status: "open", completedAt: null });

    expect((await setTaskArchived(me, t.id, true)).archivedAt).toBeInstanceOf(Date);
    expect((await listTasks(me, q())).items).toHaveLength(0);
    expect((await listTasks(me, q({ status: "archived" }))).items).toHaveLength(1);
    expect((await setTaskArchived(me, t.id, false)).archivedAt).toBeNull();

    await deleteTask(me, t.id);
    expect((await listTasks(me, q({ status: "all" }))).items).toHaveLength(0);
  });

  it("filters by status and priority", async () => {
    const a = await createTask(me, input("a", { priority: "high" }));
    await createTask(me, input("b", { priority: "low" }));
    await setTaskDone(me, a.id, true);
    expect((await listTasks(me, q())).items.map((t) => t.title)).toEqual(["b"]);
    expect((await listTasks(me, q({ status: "done" }))).items.map((t) => t.title)).toEqual(["a"]);
    expect((await listTasks(me, q({ status: "all" }))).items).toHaveLength(2);
    expect((await listTasks(me, q({ status: "all", priority: "high" }))).items.map((t) => t.title)).toEqual(["a"]);
  });

  it("paginates with a bounded page size", async () => {
    const db = getDb();
    await db
      .insert(task)
      .values(Array.from({ length: TASKS_PAGE_SIZE + 5 }, (_, i) => ({ userId: me, title: `t${i}` })));
    const p1 = await listTasks(me, q());
    expect(p1.items).toHaveLength(TASKS_PAGE_SIZE);
    expect(p1.hasMore).toBe(true);
    const p2 = await listTasks(me, q({ page: 2 }));
    expect(p2.items).toHaveLength(5);
    expect(p2.hasMore).toBe(false);
    expect(new Set([...p1.items, ...p2.items].map((t) => t.id)).size).toBe(TASKS_PAGE_SIZE + 5);
  });
});

describe("ownership", () => {
  it("another user cannot read, edit, complete, archive or delete my task, and nothing changes", async () => {
    const t = await createTask(me, input("private"));
    const attempts = [
      () => updateTask(other, { id: t.id, title: "hacked" }),
      () => setTaskDone(other, t.id, true),
      () => setTaskArchived(other, t.id, true),
      () => deleteTask(other, t.id),
    ];
    for (const attempt of attempts) expect((await code(attempt()))?.code).toBe("NOT_FOUND");
    expect((await listTasks(other, q({ status: "all" }))).items).toHaveLength(0);
    expect(await listOpenTasks(other)).toHaveLength(0);
    const [row] = await getDb().select().from(task).where(eq(task.id, t.id));
    expect(row).toMatchObject({ title: "private", status: "open", userId: me, archivedAt: null });
  });

  it("update cannot move a task to another user (userId is never writable)", async () => {
    const t = await createTask(me, input("mine"));
    await updateTask(me, { id: t.id, title: "still mine", ...({ userId: other } as object) } as never);
    const [row] = await getDb().select().from(task).where(eq(task.id, t.id));
    expect(row.userId).toBe(me);
  });
});

describe("focus time per task", () => {
  it("sums only completed focus sessions, ignoring breaks, resets and other tasks", async () => {
    const t = await createTask(me, input("deep work"));
    const t2 = await createTask(me, input("other work"));
    const at = (s: number) => ({ now: new Date(Date.UTC(2026, 4, 1, 9, 0, s)) });
    let clock = 0;
    const run = async (type: "focus" | "short_break", taskId: string | null, finish: "complete" | "reset") => {
      const { resetSession } = await import("@/server/timer-service");
      const s = await startSession(me, { type, taskId }, at(clock));
      clock += finish === "complete" ? 1500 : 100;
      await (finish === "complete" ? completeSession : resetSession)(me, s.active!.id, at(clock));
      clock += 5;
    };
    await run("focus", t.id, "complete"); // counts (25 min)
    await run("focus", t.id, "reset"); // does not count
    await run("short_break", t.id, "complete"); // break never has a task and never counts
    await run("focus", t2.id, "complete");
    const items = (await listTasks(me, q({ status: "all" }))).items;
    expect(items.find((i) => i.id === t.id)?.focusSeconds).toBe(60 * 25);
    expect(items.find((i) => i.id === t2.id)?.focusSeconds).toBe(60 * 25);
  });

  it("deleting a task keeps its sessions with a null task", async () => {
    const t = await createTask(me, input("temp"));
    const s = await startSession(me, { type: "focus", taskId: t.id });
    await deleteTask(me, t.id);
    const [row] = await getDb().select().from(focusSession).where(eq(focusSession.id, s.active!.id));
    expect(row).toBeDefined();
    expect(row.taskId).toBeNull();
  });
});

describe("constraints", () => {
  it("database rejects empty and oversized titles", async () => {
    await expect(getDb().insert(task).values({ userId: me, title: "" })).rejects.toThrow();
    await expect(
      getDb()
        .insert(task)
        .values({ userId: me, title: "x".repeat(201) }),
    ).rejects.toThrow();
  });
  it("user deletion cascades to tasks and sessions", async () => {
    const u = await createUser();
    await createTask(u, input("gone soon"));
    await startSession(u, { type: "focus" });
    await deleteUser(u);
    expect(await getDb().select().from(task).where(eq(task.userId, u))).toHaveLength(0);
    expect(await getDb().select().from(focusSession).where(eq(focusSession.userId, u))).toHaveLength(0);
  });
});
