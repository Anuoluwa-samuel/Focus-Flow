import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { account, session, user } from "@/db/schema";
import { getDb } from "@/lib/db";
import { discardUnverifiedPasswordLogin, hasPasswordLogin } from "@/server/account-service";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await getDb().delete(user).where(eq(user.id, id));
});

async function makeUser({ verified, password, google }: { verified: boolean; password: boolean; google?: boolean }) {
  const db = getDb();
  const id = randomUUID();
  created.push(id);
  await db.insert(user).values({ id, name: "T", email: `${id}@example.test`, emailVerified: verified });
  if (password)
    await db
      .insert(account)
      .values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: "hash" });
  if (google)
    await db.insert(account).values({ id: randomUUID(), accountId: `g-${id}`, providerId: "google", userId: id });
  await db
    .insert(session)
    .values({ id: randomUUID(), token: randomUUID(), userId: id, expiresAt: new Date(Date.now() + 3600_000) });
  return id;
}
const counts = async (id: string) => ({
  credential: (await getDb().select().from(account).where(eq(account.userId, id))).filter(
    (a) => a.providerId === "credential",
  ).length,
  sessions: (await getDb().select().from(session).where(eq(session.userId, id))).length,
});

describe("hasPasswordLogin", () => {
  it("is true for email/password accounts and false for Google-only accounts", async () => {
    expect(await hasPasswordLogin(await makeUser({ verified: true, password: true }))).toBe(true);
    expect(await hasPasswordLogin(await makeUser({ verified: true, password: false, google: true }))).toBe(false);
  });
  it("stays true when Google is linked as well", async () => {
    expect(await hasPasswordLogin(await makeUser({ verified: true, password: true, google: true }))).toBe(true);
  });
});

describe("discardUnverifiedPasswordLogin (pre-registration takeover guard)", () => {
  it("removes the password login and sessions of an account whose email was never verified", async () => {
    const id = await makeUser({ verified: false, password: true });
    expect(await counts(id)).toEqual({ credential: 1, sessions: 1 });
    expect(await discardUnverifiedPasswordLogin(id)).toBe(true);
    expect(await counts(id)).toEqual({ credential: 0, sessions: 0 });
    expect(await hasPasswordLogin(id)).toBe(false);
  });

  it("leaves a verified account completely alone", async () => {
    const id = await makeUser({ verified: true, password: true });
    expect(await discardUnverifiedPasswordLogin(id)).toBe(false);
    expect(await counts(id)).toEqual({ credential: 1, sessions: 1 });
  });

  it("is harmless for brand-new users and unknown ids", async () => {
    const fresh = await makeUser({ verified: false, password: false });
    expect(await discardUnverifiedPasswordLogin(fresh)).toBe(false);
    expect(await discardUnverifiedPasswordLogin(randomUUID())).toBe(false);
  });

  it("only affects the targeted user", async () => {
    const victim = await makeUser({ verified: false, password: true });
    const bystander = await makeUser({ verified: false, password: true });
    await discardUnverifiedPasswordLogin(victim);
    expect(await counts(bystander)).toEqual({ credential: 1, sessions: 1 });
  });
});
