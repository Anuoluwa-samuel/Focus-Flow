import { z } from "zod";

const title = z.string().trim().min(1, "Enter a title").max(200, "Keep the title under 200 characters");
const description = z
  .string()
  .trim()
  .max(2000, "Keep the description under 2000 characters")
  .nullish()
  .transform((v) => v || null);
const priority = z
  .enum(["low", "medium", "high"])
  .nullish()
  .transform((v) => v ?? null);
/** Date only (YYYY-MM-DD). Stored as that date at 00:00 UTC and always displayed as a plain date, so it never shifts with timezone. */
const dueDate = z
  .union([z.literal(""), z.iso.date("Use a valid date")])
  .nullish()
  .transform((v) => v || null);

export const createTaskSchema = z.object({ title, description, priority, dueDate });
export const updateTaskSchema = z
  .object({
    id: z.uuid(),
    title: title.optional(),
    description: description.optional(),
    priority: priority.optional(),
    dueDate: dueDate.optional(),
  })
  .strict();
export const taskIdSchema = z.object({ id: z.uuid() });
export const setDoneSchema = z.object({ id: z.uuid(), done: z.boolean() });
export const setArchivedSchema = z.object({ id: z.uuid(), archived: z.boolean() });

export const listTasksSchema = z.object({
  status: z.enum(["open", "done", "archived", "all"]).catch("open"),
  priority: z.enum(["low", "medium", "high"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type ListTasksQuery = z.output<typeof listTasksSchema>;
