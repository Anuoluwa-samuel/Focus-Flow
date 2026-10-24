import "server-only";
import { appendFileSync } from "node:fs";
import { Resend } from "resend";
import { getEnv } from "./env";
import { logger } from "./logger";

type Message = { to: string; subject: string; text: string };

/**
 * Sends via Resend when RESEND_API_KEY is set. In development without a key the message is printed
 * to the server console so verification/reset links can be followed locally. Never used in production
 * (env validation requires the key there).
 */
export async function sendEmail({ to, subject, text }: Message): Promise<void> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    // End-to-end tests read messages from this file. Never active in production (a Resend key is mandatory there).
    if (process.env.EMAIL_OUTBOX_FILE && env.NODE_ENV !== "production") {
      appendFileSync(process.env.EMAIL_OUTBOX_FILE, JSON.stringify({ to, subject, text }) + "\n");
    }
    console.log(`\n--- DEV EMAIL to ${to} ---\n${subject}\n${text}\n--------------------------\n`);
    return;
  }
  const { error } = await new Resend(env.RESEND_API_KEY).emails.send({ from: env.EMAIL_FROM, to, subject, text });
  if (error) {
    logger.error("email send failed", { name: error.name });
    throw new Error("Email delivery failed");
  }
}
