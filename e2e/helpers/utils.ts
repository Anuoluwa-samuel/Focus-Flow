import { expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { E2E_DATABASE_URL, OUTBOX } from "../../playwright.config";

export const PASSWORD = "correct-horse-battery-staple";

let pool: Pool | undefined;
export const db = () => (pool ??= new Pool({ connectionString: E2E_DATABASE_URL, max: 2 }));

/** Auth endpoints are rate limited per IP; every test starts with fresh counters. */
export const resetRateLimits = () => db().query("delete from rate_limit");

type Mail = { to: string; subject: string; text: string };
export function mailsTo(email: string): Mail[] {
  if (!existsSync(OUTBOX)) return [];
  return readFileSync(OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Mail)
    .filter((m) => m.to === email);
}
export async function waitForMail(email: string, subjectPart: string, after = 0): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      () =>
        (found = mailsTo(email)
          .slice(after)
          .find((m) => m.subject.includes(subjectPart))),
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return found!;
}
export const linkIn = (m: Mail) => m.text.match(/https?:\/\/\S+/)![0];

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;

/** Registers through the UI, follows the emailed link, and lands signed in. */
export async function registerAndVerify(page: Page, email: string, name = "E2E User") {
  await resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const mail = await waitForMail(email, "Verify");
  await page.goto(linkIn(mail));
  await expect(page).not.toHaveURL(/api\/auth/);
}

export async function login(page: Page, email: string) {
  await resetRateLimits();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function userId(email: string): Promise<string> {
  const r = await db().query('select id from "user" where email = $1', [email]);
  return r.rows[0].id;
}

/** Moves a live timer's clock back so it is due, as if the user had really waited. */
export async function ageLiveSession(email: string, seconds: number) {
  await db().query(
    `update focus_session set started_at = started_at - make_interval(secs => $2), last_resumed_at = last_resumed_at - make_interval(secs => $2)
     where user_id = $1 and status = 'running'`,
    [await userId(email), seconds],
  );
}
