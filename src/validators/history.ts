import { z } from "zod";
import { isDateKey } from "@/domain/dates";

const dateKey = z.string().refine(isDateKey).optional().catch(undefined);

/** Query-string filters. Anything invalid is dropped (never throws), and `invalid` lets the page say so. */
export const historyQuerySchema = z.object({
  from: dateKey,
  to: dateKey,
  type: z.enum(["focus", "short_break", "long_break"]).optional().catch(undefined),
  status: z.enum(["completed", "cancelled", "skipped", "abandoned"]).optional().catch(undefined),
  taskId: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type HistoryQuery = z.output<typeof historyQuerySchema>;

export const deleteSessionSchema = z.object({ id: z.uuid() });

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .catch(14)
    .transform((n) => ([7, 14, 30, 90].includes(n) ? n : 14)),
});
