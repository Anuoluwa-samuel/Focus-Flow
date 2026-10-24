import "server-only";
import { and, count, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { focusSession, task } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "@/validators/task";

export const TASKS_PAGE_SIZE = 20;
const MAX_ACTIVE_TASKS = 500;

const dueAt = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const notFound = () => new AppError("NOT_FOUND", "Task not found.");

/** Every query is scoped by user_id: another user's id is indistinguishable from a missing one. */
const owned = (userId: string, id: string) => and(eq(task.id, id), eq(task.userId, userId));

export async function createTask(userId: string, input: CreateTaskInput) {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(task)
    .where(and(eq(task.userId, userId), isNull(task.archivedAt)));
  if (n >= MAX_ACTIVE_TASKS)
    throw new AppError(
      "VALIDATION",
      `You can keep up to ${MAX_ACTIVE_TASKS} active tasks. Archive or delete some first.`,
    );
  // Writable columns are listed explicitly (no mass assignment); userId always comes from the session.
  const [row] = await db
    .insert(task)
    .values({
      userId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueAt: dueAt(input.dueDate),
    })
    .returning();
  return row;
}

export async function updateTask(userId: string, input: UpdateTaskInput) {
  const patch: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueAt = dueAt(input.dueDate);
  const [row] = await getDb().update(task).set(patch).where(owned(userId, input.id)).returning();
  if (!row) throw notFound();
  return row;
}

export async function setTaskDone(userId: string, id: string, done: boolean) {
  const [row] = await getDb()
    .update(task)
    .set({ status: done ? "done" : "open", completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(owned(userId, id))
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function setTaskArchived(userId: string, id: string, archived: boolean) {
  const [row] = await getDb()
    .update(task)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(owned(userId, id))
    .returning();
  if (!row) throw notFound();
  return row;
}

/** Hard delete. Focus sessions linked to the task are kept (task_id becomes NULL via ON DELETE SET NULL). */
export async function deleteTask(userId: string, id: string) {
  const rows = await getDb().delete(task).where(owned(userId, id)).returning({ id: task.id });
  if (rows.length === 0) throw notFound();
}

// "task"."id" is written out in full: drizzle renders bare column names in a single-table select, which would bind to focus_session.
/** Seconds of *completed* focus sessions attached to the task. Breaks and unfinished sessions are excluded. */
const focusSecondsFor = sql<number>`coalesce((
  select sum(${focusSession.actualSeconds})::int from ${focusSession}
  where ${focusSession.taskId} = "task"."id"
    and ${focusSession.userId} = "task"."user_id"
    and ${focusSession.type} = 'focus'
    and ${focusSession.status} = 'completed'
), 0)`;

export async function listTasks(userId: string, query: ListTasksQuery) {
  const conds: SQL[] = [eq(task.userId, userId)];
  if (query.status === "archived") conds.push(isNotNull(task.archivedAt));
  else {
    conds.push(isNull(task.archivedAt));
    if (query.status === "open") conds.push(eq(task.status, "open"));
    if (query.status === "done") conds.push(eq(task.status, "done"));
  }
  if (query.priority) conds.push(eq(task.priority, query.priority));

  const rows = await getDb()
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      archivedAt: task.archivedAt,
      createdAt: task.createdAt,
      focusSeconds: focusSecondsFor.as("focus_seconds"),
    })
    .from(task)
    .where(and(...conds))
    .orderBy(desc(task.createdAt), desc(task.id))
    .limit(TASKS_PAGE_SIZE + 1) // one extra row tells us whether another page exists
    .offset((query.page - 1) * TASKS_PAGE_SIZE);

  return { items: rows.slice(0, TASKS_PAGE_SIZE), hasMore: rows.length > TASKS_PAGE_SIZE, page: query.page };
}

/** Small list for pickers and the dashboard: open, non-archived, newest first. */
export async function listOpenTasks(userId: string, limit = 20) {
  return getDb()
    .select({ id: task.id, title: task.title, priority: task.priority })
    .from(task)
    .where(and(eq(task.userId, userId), eq(task.status, "open"), isNull(task.archivedAt)))
    .orderBy(desc(task.createdAt))
    .limit(Math.min(limit, 50));
}
