import { z } from "zod";

export const startSchema = z.object({
  type: z.enum(["focus", "short_break", "long_break"]),
  taskId: z.uuid().nullish(),
});
export const sessionIdSchema = z.object({ sessionId: z.uuid() });

export type StartInput = z.infer<typeof startSchema>;
