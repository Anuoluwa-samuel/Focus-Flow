import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

/** Reads and validates the session against the database (cookie alone is never trusted). Deduped per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const requestHeaders = await headers(); // read first: opts the page out of prerendering
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, email, name, emailVerified } = session.user;
  return { id, email, name, emailVerified };
});

/** Authentication gate for pages and server actions. Services receive the returned id; they never accept a userId from the client. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}
