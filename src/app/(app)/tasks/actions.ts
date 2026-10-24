"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-helpers";
import * as tasks from "@/server/task-service";
import { createTaskSchema, setArchivedSchema, setDoneSchema, taskIdSchema, updateTaskSchema } from "@/validators/task";

const refreshed = <T>(v: T): T => {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return v;
};

export async function createTaskAction(input: unknown) {
  return runAction(createTaskSchema, input, async (u, d) => refreshed({ id: (await tasks.createTask(u.id, d)).id }));
}
export async function updateTaskAction(input: unknown) {
  return runAction(updateTaskSchema, input, async (u, d) => refreshed({ id: (await tasks.updateTask(u.id, d)).id }));
}
export async function setTaskDoneAction(input: unknown) {
  return runAction(setDoneSchema, input, async (u, d) =>
    refreshed({ id: (await tasks.setTaskDone(u.id, d.id, d.done)).id }),
  );
}
export async function setTaskArchivedAction(input: unknown) {
  return runAction(setArchivedSchema, input, async (u, d) =>
    refreshed({ id: (await tasks.setTaskArchived(u.id, d.id, d.archived)).id }),
  );
}
export async function deleteTaskAction(input: unknown) {
  return runAction(taskIdSchema, input, async (u, d) => {
    await tasks.deleteTask(u.id, d.id);
    return refreshed({ id: d.id });
  });
}
