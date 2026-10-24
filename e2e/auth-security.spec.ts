import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  db,
  linkIn,
  login,
  mailsTo,
  PASSWORD,
  registerAndVerify,
  resetRateLimits,
  uniqueEmail,
  waitForMail,
} from "./helpers/utils";

const json = { "Content-Type": "application/json" };
const ORIGIN = "http://127.0.0.1:3250";
const withOrigin = { ...json, Origin: ORIGIN };

async function signUp(request: APIRequestContext, email: string) {
  return request.post("/api/auth/sign-up/email", {
    headers: withOrigin,
    data: { name: "Sec Test", email, password: PASSWORD },
  });
}

test.beforeEach(resetRateLimits);

test("sign-up gives the same answer for a new and an already-registered address", async ({ request, page }) => {
  const email = uniqueEmail("dup");
  const first = await signUp(request, email);
  const second = await signUp(request, email);
  expect(second.status()).toBe(first.status());
  const a = await first.json();
  const b = await second.json();
  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  expect(b.token).toBe(a.token); // both null: no session is issued before verification
  expect(b.user.emailVerified).toBe(false);
  // the UI is also identical
  await page.goto("/register");
  await page.getByLabel("Name").fill("Dup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("If that address can be used");
  expect((await db().query('select count(*)::int n from "user" where email = $1', [email])).rows[0].n).toBe(1);
});

test("sign-in does not reveal whether an account exists; unverified accounts cannot sign in", async ({ request }) => {
  const email = uniqueEmail("enum");
  await signUp(request, email);
  const unknown = await request.post("/api/auth/sign-in/email", {
    headers: withOrigin,
    data: { email: uniqueEmail("ghost"), password: PASSWORD },
  });
  const wrongPw = await request.post("/api/auth/sign-in/email", {
    headers: withOrigin,
    data: { email, password: "definitely-not-right" },
  });
  expect(unknown.status()).toBe(401);
  expect(wrongPw.status()).toBe(401);
  expect(await wrongPw.json()).toEqual(await unknown.json());
  const unverified = await request.post("/api/auth/sign-in/email", {
    headers: withOrigin,
    data: { email, password: PASSWORD },
  });
  expect(unverified.status()).toBe(403); // right password, but no session without verification
  expect(unverified.headers()["set-cookie"]).toBeUndefined();
});

test("cross-origin state-changing requests are rejected (CSRF)", async ({ request }) => {
  const email = uniqueEmail("csrf");
  const res = await request.post("/api/auth/sign-in/email", {
    headers: { ...json, Origin: "http://evil.example" },
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(403);
  const body = await res.text();
  expect(body.toLowerCase()).toContain("origin");
  const signup = await request.post("/api/auth/sign-up/email", {
    headers: { ...json, Origin: "http://evil.example" },
    data: { name: "x", email, password: PASSWORD },
  });
  expect(signup.status()).toBe(403);
  expect((await db().query('select count(*)::int n from "user" where email = $1', [email])).rows[0].n).toBe(0);
});

test("login attempts are rate limited", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 8; i++) {
    statuses.push(
      (
        await request.post("/api/auth/sign-in/email", {
          headers: withOrigin,
          data: { email: "nobody@example.test", password: "wrong-password-1" },
        })
      ).status(),
    );
  }
  expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
  expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
});

test("oversized and malformed request bodies are rejected without a server error", async ({ request }) => {
  const bigEmail = uniqueEmail("big");
  const big = await request.post("/api/auth/sign-up/email", {
    headers: withOrigin,
    data: { name: "x".repeat(2_000_000), email: bigEmail, password: PASSWORD },
  });
  expect(big.status()).toBe(413);
  // a modest but still too long name is refused by field validation
  const longName = await request.post("/api/auth/sign-up/email", {
    headers: withOrigin,
    data: { name: "x".repeat(500), email: bigEmail, password: PASSWORD },
  });
  expect(longName.status()).toBe(400);
  expect((await db().query('select count(*)::int n from "user" where email = $1', [bigEmail])).rows[0].n).toBe(0);
  const junk = await request.post("/api/auth/sign-in/email", { headers: withOrigin, data: "{not json" });
  expect(junk.status()).toBeLessThan(500);
});

test("logout invalidates the session token server-side", async ({ page, request }) => {
  const email = uniqueEmail("logout");
  await registerAndVerify(page, email);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.includes("session_token"))!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  const cookieHeader = `${session.name}=${session.value}`;
  const before = await request.get("/api/auth/get-session", { headers: { Cookie: cookieHeader } });
  expect((await before.json())?.user?.email).toBe(email);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  const after = await request.get("/api/auth/get-session", { headers: { Cookie: cookieHeader } });
  expect(await after.json()).toBeNull(); // replaying the stolen cookie no longer works
  const api = await request.get("/api/timer", { headers: { Cookie: cookieHeader } });
  expect(api.status()).toBe(401);
});

test("password reset: single use, expires with the link, and signs out every other device", async ({
  browser,
  page,
}) => {
  const email = uniqueEmail("reset");
  await registerAndVerify(page, email);
  await page.context().clearCookies();
  await login(page, email); // device 1

  const other = await browser.newContext(); // device 2
  const otherPage = await other.newPage();
  await login(otherPage, email);
  await otherPage.goto("/dashboard");

  // Forgotten-password flow from a third place; the answer is the same for unknown addresses
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await resetRateLimits();
  await ap.goto("/forgot-password");
  await ap.getByLabel("Email").fill(uniqueEmail("nobody"));
  await ap.getByRole("button", { name: "Send reset link" }).click();
  await expect(ap.getByRole("status")).toContainText("If an account exists");
  await ap.goto("/forgot-password");
  await ap.getByLabel("Email").fill(email);
  await ap.getByRole("button", { name: "Send reset link" }).click();
  await expect(ap.getByRole("status")).toContainText("If an account exists");

  const mail = await waitForMail(email, "Reset");
  const resetUrl = linkIn(mail);
  expect(resetUrl).not.toContain(PASSWORD);
  await ap.goto(resetUrl);
  await expect(ap).toHaveURL(/\/reset-password\?token=/);
  const newPassword = "a-brand-new-passphrase-42";
  await ap.getByLabel("New password").fill(newPassword);
  await ap.getByRole("button", { name: "Set new password" }).click();
  await expect(ap).toHaveURL(/\/login/);

  // the same link cannot be used again
  await ap.goto(resetUrl);
  await expect(ap.getByText("This link is not valid")).toBeVisible(); // used token: no form is offered

  // old password is dead, new one works, and the other devices were signed out
  await resetRateLimits();
  const r = await ap.request.post("/api/auth/sign-in/email", {
    headers: withOrigin,
    data: { email, password: PASSWORD },
  });
  expect(r.status()).toBe(401);
  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const ok = await ap.request.post("/api/auth/sign-in/email", {
    headers: withOrigin,
    data: { email, password: newPassword },
  });
  expect(ok.status()).toBe(200);
  await Promise.all([other.close(), anon.close()]);
});

test("a malformed or tampered reset token is refused", async ({ page }) => {
  await page.goto("/reset-password?token=not-a-real-token");
  await page.getByLabel("New password").fill("whatever-long-password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByText("This link is not valid")).toBeVisible();
});

test("deleting the account requires the password, a typed confirmation and an emailed link, then removes all data", async ({
  page,
}) => {
  const email = uniqueEmail("delete");
  await registerAndVerify(page, email);
  await page.goto("/tasks");
  await page.getByLabel("New task").fill("to be erased");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("to be erased")).toBeVisible();
  await page
    .getByRole("button", { name: "Start focus" })
    .isHidden()
    .catch(() => undefined);

  await page.goto("/settings");
  const form = page.getByRole("region", { name: "Delete account" });
  await form.getByLabel("Password").fill(PASSWORD);
  await form.getByRole("button", { name: "Send deletion link" }).click();
  await expect(form.getByText("Type DELETE to confirm")).toBeVisible(); // confirmation phrase is mandatory
  await form.getByLabel(/Type/).fill("DELETE");
  await form.getByLabel("Password").fill("wrong-password-123");
  await form.getByRole("button", { name: "Send deletion link" }).click();
  await expect(form.getByRole("alert").filter({ hasText: "password is incorrect" })).toBeVisible();
  expect((await db().query('select count(*)::int n from "user" where email = $1', [email])).rows[0].n).toBe(1);

  const before = mailsTo(email).length;
  await form.getByLabel("Password").fill(PASSWORD);
  await form.getByRole("button", { name: "Send deletion link" }).click();
  await expect(form.getByRole("status")).toContainText("Check your email");
  const mail = await waitForMail(email, "deletion", before - 0);
  expect((await db().query('select count(*)::int n from "user" where email = $1', [email])).rows[0].n).toBe(1); // not deleted until the link is opened
  await page.goto(linkIn(mail));
  await expect
    .poll(async () => (await db().query('select count(*)::int n from "user" where email = $1', [email])).rows[0].n)
    .toBe(0);
  const left = await db().query(
    "select (select count(*) from task where title = 'to be erased')::int t, (select count(*) from session where user_id not in (select id from \"user\"))::int s",
  );
  expect(left.rows[0]).toEqual({ t: 0, s: 0 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
