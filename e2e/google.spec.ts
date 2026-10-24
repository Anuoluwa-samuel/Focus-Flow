import { expect, test } from "@playwright/test";
import { resetRateLimits } from "./helpers/utils";

// The dev server runs with dummy Google credentials. These tests verify OUR side of the OAuth flow
// (button, redirect parameters, failure handling). They never contact Google; a real sign-in needs real credentials.
test.beforeEach(resetRateLimits);

test("the Google button appears on sign-in and sign-up when Google is configured", async ({ page }) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  }
});

test("clicking it redirects to Google with the right client, callback, scopes, state and PKCE", async ({ page }) => {
  let googleUrl: URL | undefined;
  await page.route("https://accounts.google.com/**", (route) => {
    googleUrl = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub google</title>" });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/accounts\.google\.com/);
  expect(googleUrl!.searchParams.get("client_id")).toBe("e2e-dummy-client-id.apps.googleusercontent.com");
  expect(googleUrl!.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3250/api/auth/callback/google");
  expect(googleUrl!.searchParams.get("response_type")).toBe("code");
  expect(googleUrl!.searchParams.get("scope")).toContain("email");
  expect(googleUrl!.searchParams.get("state")?.length).toBeGreaterThan(16);
  expect(googleUrl!.searchParams.get("code_challenge_method")).toBe("S256"); // PKCE
  expect(googleUrl!.searchParams.get("client_secret")).toBeNull(); // the secret never goes through the browser
});

test("a hostile ?next= cannot be used as the post-login destination", async ({ page }) => {
  const posted: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/auth/sign-in/social")) posted.push(r.postData() ?? "");
  });
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ status: 200, body: "stub" }));
  await page.goto(`/login?next=${encodeURIComponent("https://evil.example/steal")}`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/accounts\.google\.com/);
  expect(posted.join("")).toContain('"callbackURL":"/dashboard"');
  expect(posted.join("")).not.toContain("evil.example");
});

test("a failed or forged callback lands on our sign-in page with a generic message", async ({ page }) => {
  await page.goto("/api/auth/callback/google?code=forged&state=forged");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't sign you in with Google" })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name.includes("session_token"))).toBe(false);
});

test("the error code in the URL is never echoed into the page", async ({ page }) => {
  const payload = "<img src=x onerror=alert(1)>pwned-marker";
  await page.goto(`/login?error=${encodeURIComponent(payload)}`);
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't sign you in with Google" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("pwned-marker");
  expect(await page.locator("img[src='x']").count()).toBe(0);
});

test("Google sign-in requests are rate limited", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 13; i++) {
    const r = await request.post("/api/auth/sign-in/social", {
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3250" },
      data: { provider: "google", callbackURL: "/dashboard" },
    });
    statuses.push(r.status());
  }
  expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
  expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
});
