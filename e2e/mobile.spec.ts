import { expect, test } from "@playwright/test";
import { registerAndVerify, uniqueEmail } from "./helpers/utils";

test("phone layout: no sideways scrolling, tappable controls, scrollable nav", async ({ page }) => {
  await registerAndVerify(page, uniqueEmail("mobile"));
  for (const path of ["/", "/login", "/dashboard", "/tasks", "/history", "/analytics", "/settings", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(sw, `${path} horizontal overflow`).toBeLessThanOrEqual(cw);
  }
  await page.goto("/dashboard");
  const clock = page.getByTestId("clock");
  await expect(clock).toBeVisible();
  const box = await clock.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeLessThanOrEqual(viewport.width);
  expect(parseFloat(await clock.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(48); // legible at small sizes

  const buttons = page.locator("main button:visible, header a:visible, header button:visible");
  const small: string[] = [];
  for (const b of await buttons.all()) {
    const r = await b.boundingBox();
    if (r && (r.height < 44 || r.width < 44))
      small.push(
        `${(await b.innerText()).trim() || (await b.getAttribute("aria-label"))} ${Math.round(r.width)}x${Math.round(r.height)}`,
      );
  }
  expect(small, "touch targets below 44px").toEqual([]);

  await page.getByRole("button", { name: "Start focus" }).tap();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).tap();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).tap();
  await page.getByRole("link", { name: "Settings" }).tap();
  await expect(page).toHaveURL(/\/settings/);
});
