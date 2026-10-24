"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-helpers";
import { updatePreferences } from "@/server/preferences";
import { preferencesSchema } from "@/validators/preferences";

export async function updatePreferencesAction(input: unknown) {
  return runAction(preferencesSchema, input, async (u, d) => {
    await updatePreferences(u.id, d);
    revalidatePath("/", "layout"); // theme and timer durations are read in the shared layout and dashboard
    return { saved: true as const };
  });
}
