import { expect, test } from "@playwright/test";
import { ageLiveSession, db, login, PASSWORD, registerAndVerify, uniqueEmail, userId } from "./helpers/utils";

test.describe.serial("a user's first day", () => {
  const email = uniqueEmail("journey");

  test("1. visitor registers and verifies, then reaches the dashboard", async ({ page }) => {
    await registerAndVerify(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("clock")).toHaveText("25:00");
    await expect(page.getByRole("heading", { name: "Focus timer" })).toBeAttached();
  });

  test("empty states: tasks, history and analytics explain what to do", async ({ page }) => {
    await login(page, email);
    await page.goto("/tasks");
    await expect(page.getByText("Nothing to do yet")).toBeVisible();
    await page.goto("/history");
    await expect(page.getByText("No finished sessions yet")).toBeVisible();
    await page.goto("/analytics");
    await expect(page.getByText(/No completed focus sessions in the last 14 days/)).toBeVisible();
    await expect(page.locator("figure")).toHaveCount(0); // no chart drawn without data
  });

  test("2. configures timer preferences; invalid values are rejected with accessible errors", async ({ page }) => {
    await login(page, email);
    await page.goto("/settings");
    await page.getByLabel("Focus (minutes)").fill("999");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "at most 180" })).toBeVisible();
    await expect(page.getByLabel("Focus (minutes)")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Focus (minutes)").fill("20");
    await page.getByLabel("Daily focus goal (minutes, optional)").fill("60");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Focus (minutes)")).toHaveValue("20");
  });

  test("3. creates a task, validation works, and a double click creates only one", async ({ page }) => {
    await login(page, email);
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Enter a title")).toBeVisible();

    await page.getByLabel("New task").fill("Write the report");
    await page.getByRole("button", { name: "Add task" }).dblclick();
    await expect(page.getByText("Write the report")).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText("Write the report")).toHaveCount(1);
  });

  test("4-7. starts, pauses, resumes, completes, and the state survives a refresh", async ({ page }) => {
    await login(page, email);
    await page.getByLabel("Working on").selectOption({ label: "Write the report" });
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.getByText("Working on: Write the report")).toBeVisible();

    // let some real time pass, then pause: the clock must freeze and a refresh must keep it paused at the same value
    await page.waitForTimeout(2200);
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    const frozen = await page.getByTestId("clock").innerText();
    await page.waitForTimeout(2200);
    expect(await page.getByTestId("clock").innerText()).toBe(frozen);
    await page.reload();
    await expect(page.getByTestId("clock")).toHaveText(frozen);
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.reload(); // running timer is still running after a refresh, not restarted
    const afterReload = await page.getByTestId("clock").innerText();
    expect(afterReload <= frozen).toBe(true);
    expect(frozen).not.toBe("20:00");
    expect(afterReload).not.toBe("20:00");

    // time passes (clock moved back server-side), the page completes it exactly once
    await ageLiveSession(email, 20 * 60 + 5);
    await page.reload();
    await expect(page.getByText(/Focus complete/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("20:00 recorded")).toBeVisible();
    const rows = await db().query(
      "select status, actual_seconds from focus_session where user_id = $1 and type = 'focus'",
      [await userId(email)],
    );
    expect(rows.rows).toEqual([{ status: "completed", actual_seconds: 1200 }]);
    await expect(page.getByRole("radio", { name: "Short break" })).toHaveAttribute("aria-checked", "true");
  });

  test("8. history and analytics reflect the completed session", async ({ page }) => {
    await login(page, email);
    await page.goto("/history");
    const row = page.getByRole("row", { name: /Focus.*Write the report.*Completed/ });
    await expect(row).toBeVisible();
    await page.goto("/analytics");
    await expect(page.getByText("20m").first()).toBeVisible();
    await expect(
      page.getByRole("term").filter({ hasText: "Sessions" }).locator("xpath=following-sibling::dd[1]"),
    ).toContainText(/^1/);
    await page.goto("/tasks");
    await expect(page.getByText("20:00 focused")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Today" })).toContainText("20m");
  });

  test("history filters and deleting a record", async ({ page }) => {
    await login(page, email);
    await page.goto("/history?type=long_break");
    await expect(page.getByText("No sessions match these filters")).toBeVisible();
    await page.goto("/history?from=2026-02-30&status=completed");
    await expect(page.getByText("One of the dates wasn't valid and was ignored.")).toBeVisible();
    await page.getByRole("button", { name: /^Delete Focus session/ }).click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("No sessions match these filters")).toBeVisible();
  });

  test("9. logging out locks the protected pages", async ({ page }) => {
    await login(page, email);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    for (const path of ["/dashboard", "/tasks", "/history", "/analytics", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    }
    const res = await page.request.get("/api/timer");
    expect(res.status()).toBe(401);
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD + "x");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect" })).toHaveText("Incorrect email or password.");
  });
});
