"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-helpers";
import { deleteHistoryRecord } from "@/server/history-service";
import { deleteSessionSchema } from "@/validators/history";

export async function deleteSessionAction(input: unknown) {
  return runAction(deleteSessionSchema, input, async (u, d) => {
    await deleteHistoryRecord(u.id, d.id);
    revalidatePath("/history");
    revalidatePath("/analytics");
    revalidatePath("/dashboard");
    return { id: d.id };
  });
}
