import "server-only";
import { and, eq } from "drizzle-orm";
import { account, session, user } from "@/db/schema";
import { getDb } from "@/lib/db";

/** Does this user have an email-and-password login? Google-only accounts do not. */
export async function hasPasswordLogin(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return Boolean(row);
}

/**
 * Called just before a social (Google) login is attached to an existing user. If that user's email was never
 * verified, the password on the account may have been set by someone who does not own the address, so the
 * password login and any sessions are removed. Verified users are untouched. Returns whether anything was removed.
 */
export async function discardUnverifiedPasswordLogin(userId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [u] = await tx.select({ verified: user.emailVerified }).from(user).where(eq(user.id, userId));
    if (!u || u.verified) return false;
    const removed = await tx
      .delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    await tx.delete(session).where(eq(session.userId, userId));
    return removed.length > 0;
  });
}
