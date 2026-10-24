import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { db, login, registerAndVerify, uniqueEmail, userId } from "./helpers/utils";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `${label} axe violations`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe scan, ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test("public pages", async ({ page }) => {
      for (const path of [
        "/",
        "/login",
        "/register",
        "/forgot-password",
        "/privacy",
        "/terms",
        "/support",
        "/does-not-exist",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await scan(page, `${scheme} ${path}`);
      }
    });

    test("signed-in pages with real data", async ({ page }) => {
      const email = uniqueEmail(`a11y-${scheme}`);
      await registerAndVerify(page, email);
      const uid = await userId(email);
      const t = (
        await db().query(
          "insert into task (user_id, title, priority, due_at) values ($1,'Axe task','high', now()) returning id",
          [uid],
        )
      ).rows[0].id;
      await db().query(
        `insert into focus_session (user_id, task_id, type, status, started_at, planned_seconds, accumulated_seconds, actual_seconds, ended_at)
         select $1, $2, 'focus', 'completed', now() - (g || ' days')::interval, 1500, 1500, 1500, now() - (g || ' days')::interval + interval '25 minutes' from generate_series(0,5) g`,
        [uid, t],
      );
      for (const path of ["/dashboard", "/tasks", "/history", "/analytics", "/settings"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await scan(page, `${scheme} ${path}`);
      }
      // a running timer state too
      await page.goto("/dashboard");
      await page.getByRole("radio", { name: "Focus" }).click();
      await page.getByRole("button", { name: "Start focus" }).click();
      await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
      await scan(page, `${scheme} running timer`);
    });
  });
}

test("keyboard only: sign in, start, pause, resume and reset without a mouse", async ({ page }) => {
  const email = uniqueEmail("keyboard");
  await registerAndVerify(page, email);
  await page.context().clearCookies();
  await login(page, email);

  await page.goto("/dashboard");
  // skip link is the first stop and works
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");

  const start = page.getByRole("button", { name: "Start focus" });
  await start.focus();
  await expect(start).toBeFocused();
  const ring = await start.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(ring).toBe("solid"); // visible focus indicator
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Start/ })).toBeVisible();
  // the live status region announced transitions rather than the countdown
  await expect(page.getByRole("status").filter({ hasText: /Session reset/ })).toBeAttached();
  const live = await page.locator("[aria-live]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(live).not.toContain("clock");
});
