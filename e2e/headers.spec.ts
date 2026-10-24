import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

const PASSWORD = "correct-horse-battery-staple";
const ORIGIN = "http://127.0.0.1:3251";

test.describe("production build", () => {
  test("every page carries a strict, per-request CSP and the standard security headers", async ({ request }) => {
    const nonces = new Set<string>();
    for (const path of ["/", "/login", "/register", "/privacy", "/nope"]) {
      const res = await request.get(path);
      const h = res.headers();
      const csp = h["content-security-policy"];
      expect(csp, path).toBeTruthy();
      const nonce = csp.match(/'nonce-([^']+)'/)![1];
      nonces.add(nonce);
      expect(csp).toContain("script-src 'self' 'nonce-");
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("upgrade-insecure-requests");
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["x-powered-by"]).toBeUndefined();
      // scripts in the HTML carry that same nonce
      const html = await res.text();
      const tags = html.match(/<script[^>]*>/g) ?? [];
      expect(tags.every((t) => t.includes(`nonce="${nonce}"`) || /type="application\/json"/.test(t))).toBe(true);
    }
    expect(nonces.size).toBe(5); // a fresh nonce on every request
  });

  test("private routes are never cacheable and redirect when signed out", async ({ request }) => {
    for (const path of ["/dashboard", "/tasks", "/history", "/analytics", "/settings"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toContain("/login");
      expect(res.headers()["cache-control"]).toMatch(/no-store/);
    }
    const api = await request.get("/api/timer");
    expect(api.status()).toBe(401);
    expect(api.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("the session cookie is HttpOnly, Secure, SameSite=Lax and prefixed; responses with it are no-store", async ({
    request,
  }) => {
    const email = `headers-${Date.now()}@example.test`;
    const h = { "Content-Type": "application/json", Origin: ORIGIN };
    await request.post("/api/auth/sign-up/email", { headers: h, data: { name: "Hdr", email, password: PASSWORD } });
    const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
    await pool.query('update "user" set email_verified = true where email = $1', [email]);
    const login = await request.post("/api/auth/sign-in/email", { headers: h, data: { email, password: PASSWORD } });
    expect(login.status()).toBe(200);
    const setCookie = login.headers()["set-cookie"];
    expect(setCookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(login.headers()["cache-control"]).toMatch(/no-store|private|no-cache/);
    expect(JSON.stringify(await login.json())).not.toMatch(/password|hash/i);
    await pool.end();
  });

  test("errors never leak stack traces or internals", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      data: "{broken",
    });
    const body = await res.text();
    expect(body).not.toMatch(/at\s+\S+\s+\(|node_modules|\/Users\/|postgres|ECONN/);
    const nf = await (await request.get("/definitely/not/here")).text();
    expect(nf).not.toMatch(/node_modules|\/Users\//);
  });
});
