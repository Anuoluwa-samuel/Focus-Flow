import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3),
  // Optional: "Continue with Google" is shown only when both are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated lazily so `next build` does not need secrets. Reports variable names only, never values. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }
  if (Boolean(parsed.data.GOOGLE_CLIENT_ID) !== Boolean(parsed.data.GOOGLE_CLIENT_SECRET)) {
    throw new Error("Invalid environment configuration:\nGOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: set both or neither");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.RESEND_API_KEY) {
    throw new Error("Invalid environment configuration:\nRESEND_API_KEY: required in production");
  }
  cached = parsed.data;
  return cached;
}

/** True when Google sign-in is configured. Safe to pass to client components (a boolean, never the credentials). */
export const isGoogleEnabled = () => Boolean(getEnv().GOOGLE_CLIENT_ID && getEnv().GOOGLE_CLIENT_SECRET);
