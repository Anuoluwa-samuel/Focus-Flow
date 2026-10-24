import "server-only";
import type { z } from "zod";
import { AppError, ok, toFailure, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireUser, type SessionUser } from "./session";

/**
 * Standard shape for a state-changing server action:
 * authenticate -> validate -> run business rule -> typed result, with unexpected errors hidden.
 * The userId handed to `run` always comes from the session, never from the client payload.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  run: (user: SessionUser, data: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        "VALIDATION",
        "Invalid request.",
        parsed.error.flatten().fieldErrors as Record<string, string[]>,
      );
    return ok(await run(user, parsed.data));
  } catch (err) {
    // redirect() from requireUser() must propagate
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
    )
      throw err;
    return toFailure(err, logger.error);
  }
}
