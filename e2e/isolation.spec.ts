import { expect, test } from "@playwright/test";
import { db, registerAndVerify, uniqueEmail, userId } from "./helpers/utils";

test("another user cannot see or reach the first user's tasks and sessions", async ({ browser }) => {
  const a = uniqueEmail("iso-a");
  const b = uniqueEmail("iso-b");

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await registerAndVerify(pageA, a, "Alice Private");
  await pageA.goto("/tasks");
  await pageA.getByLabel("New task").fill("Alice secret plan");
  await pageA.getByRole("button", { name: "Add task" }).click();
  await expect(pageA.getByText("Alice secret plan")).toBeVisible();
  const taskId = (await db().query("select id from task where user_id = $1", [await userId(a)])).rows[0].id as string;
  await db().query(
    `insert into focus_session (user_id, task_id, type, status, started_at, last_resumed_at, planned_seconds, accumulated_seconds, actual_seconds, ended_at)
     values ($1, $2, 'focus', 'completed', now() - interval '1 hour', null, 1500, 1500, 1500, now() - interval '35 minutes')`,
    [await userId(a), taskId],
  );
  await pageA.goto("/history");
  await expect(pageA.getByRole("cell", { name: "Alice secret plan" })).toBeVisible();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await registerAndVerify(pageB, b, "Bob");
  for (const url of ["/tasks?status=all", "/history", `/history?taskId=${taskId}`, "/analytics?days=90"]) {
    await pageB.goto(url);
    await expect(pageB.locator("body")).not.toContainText("Alice secret plan");
    await expect(pageB.locator("body")).not.toContainText("Alice Private");
  }
  await pageB.goto("/history");
  await expect(pageB.getByText("No finished sessions yet")).toBeVisible();
  await pageB.goto("/analytics");
  await expect(pageB.getByText(/No completed focus sessions/)).toBeVisible();
  // the timer state endpoint only ever describes the caller
  const state = await (await pageB.request.get("/api/timer")).json();
  expect(state.active).toBeNull();
  // and A's data is unchanged
  expect((await db().query("select count(*)::int as n from task where id = $1", [taskId])).rows[0].n).toBe(1);

  // a signed-out context cannot reach any private route or API
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  expect((await anonPage.request.get("/api/timer")).status()).toBe(401);
  await anonPage.goto(`/history?taskId=${taskId}`);
  await expect(anonPage).toHaveURL(/\/login/);
  await Promise.all([ctxA.close(), ctxB.close(), anon.close()]);
});

test("two tabs of the same user completing at once record one session", async ({ browser }) => {
  const email = uniqueEmail("concurrent");
  const ctx = await browser.newContext();
  const p1 = await ctx.newPage();
  await registerAndVerify(p1, email);
  await p1.getByRole("button", { name: "Start focus" }).click();
  await expect(p1.getByRole("button", { name: "Pause" })).toBeVisible();
  const p2 = await ctx.newPage();
  await p2.goto("/dashboard");
  await expect(p2.getByRole("button", { name: "Pause" })).toBeVisible();

  const { ageLiveSession } = await import("./helpers/utils");
  await ageLiveSession(email, 25 * 60 + 5);
  // both tabs wake at the same moment and both try to complete
  await Promise.all([p1.reload(), p2.reload()]);
  await expect(p1.getByText(/Focus complete/)).toBeVisible({ timeout: 15_000 });
  await expect(p2.getByText(/Focus complete/)).toBeVisible({ timeout: 15_000 });
  const rows = await db().query("select status from focus_session where user_id = $1", [await userId(email)]);
  expect(rows.rows).toEqual([{ status: "completed" }]);
  await ctx.close();
});

test("login with a hostile ?next= never leaves the site", async ({ page }) => {
  const email = uniqueEmail("redirect");
  await registerAndVerify(page, email);
  await page.context().clearCookies();
  for (const next of ["https://evil.example/phish", "//evil.example", "/\\evil.example"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3250\/dashboard/);
    await page.context().clearCookies();
    await db().query("delete from rate_limit");
  }
});
