import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/db/schema";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { logger } from "./logger";

/** Second line of defence behind the route-level size limit: bounded profile fields even if the API is called directly. */
function assertName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80)
    throw new APIError("BAD_REQUEST", { message: "Name must be 1 to 80 characters." });
}

function build() {
  const env = getEnv();
  const prod = env.NODE_ENV === "production";

  // Not awaited inside Better Auth callbacks, so response timing does not reveal whether an address exists.
  const fireAndLog = (p: Promise<void>) => p.catch((e) => logger.error("auth email failed", { name: e?.name }));

  return betterAuth({
    appName: "FocusFlow",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        fireAndLog(
          sendEmail({
            to: user.email,
            subject: "Reset your FocusFlow password",
            text: `Use this link within one hour to choose a new password:\n\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
          }),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        fireAndLog(
          sendEmail({
            to: user.email,
            subject: "Verify your FocusFlow email",
            text: `Confirm your email address to finish creating your account:\n\n${url}\n\nThis link expires in 24 hours.`,
          }),
        );
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          fireAndLog(
            sendEmail({
              to: user.email,
              subject: "Confirm FocusFlow account deletion",
              text: `Open this link to permanently delete your account and all its data:\n\n${url}\n\nIf this was not you, ignore this email and change your password.`,
            }),
          );
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true, // also in development, so the limits are exercised
      storage: "database", // shared across serverless instances
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/reset-password": { window: 3600, max: 10 },
        "/send-verification-email": { window: 3600, max: 5 },
        "/verify-email": { window: 3600, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: prod,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: prod },
    },
    databaseHooks: {
      user: {
        update: {
          before: async (data) => {
            if (typeof data.name === "string") assertName(data.name);
            return { data };
          },
        },
        create: {
          before: async (data) => {
            assertName(data.name);
            if (data.email.length > 254) throw new APIError("BAD_REQUEST", { message: "Email is too long." });
            return { data };
          },
          // Every account gets a preferences row with the column defaults.
          after: async (created) => {
            await getDb().insert(schema.userPreferences).values({ userId: created.id }).onConflictDoNothing();
          },
        },
      },
    },
    plugins: [nextCookies()], // keep last
  });
}

let instance: ReturnType<typeof build> | undefined;

export function getAuth() {
  instance ??= build();
  return instance;
}
