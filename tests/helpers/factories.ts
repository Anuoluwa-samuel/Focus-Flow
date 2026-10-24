import { randomUUID } from "node:crypto";
import { task, user, userPreferences } from "@/db/schema";
import { getDb } from "@/lib/db";

export async function createUser() {
  const id = randomUUID();
  await getDb()
    .insert(user)
    .values({ id, name: "Test", email: `${id}@example.test`, emailVerified: true });
  await getDb().insert(userPreferences).values({ userId: id });
  return id;
}

export async function createTask(userId: string, title = "Write tests") {
  const [t] = await getDb().insert(task).values({ userId, title }).returning();
  return t;
}

export async function deleteUser(id: string) {
  const { eq } = await import("drizzle-orm");
  await getDb().delete(user).where(eq(user.id, id));
}

type SeedSession = {
  type?: "focus" | "short_break" | "long_break";
  status?: "completed" | "cancelled" | "skipped" | "abandoned";
  startedAt: string; // ISO UTC
  seconds?: number;
  taskId?: string | null;
};

/** Inserts a finished session directly (bypassing the timer service) at an exact UTC time. */
export async function seedSession(userId: string, s: SeedSession) {
  const { focusSession } = await import("@/db/schema");
  const seconds = s.seconds ?? 1500;
  const started = new Date(s.startedAt);
  const status = s.status ?? "completed";
  const [row] = await getDb()
    .insert(focusSession)
    .values({
      userId,
      taskId: s.taskId ?? null,
      type: s.type ?? "focus",
      status,
      startedAt: started,
      plannedSeconds: Math.max(60, seconds),
      accumulatedSeconds: seconds,
      actualSeconds: seconds,
      endedAt: new Date(started.getTime() + seconds * 1000),
      createdAt: started,
      updatedAt: started,
    })
    .returning();
  return row;
}

export async function setTimezone(userId: string, timezone: string, dailyGoalMinutes: number | null = null) {
  const { eq } = await import("drizzle-orm");
  await getDb().update(userPreferences).set({ timezone, dailyGoalMinutes }).where(eq(userPreferences.userId, userId));
}
