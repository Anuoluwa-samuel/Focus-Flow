import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/x",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_FROM: "FocusFlow <a@b.co>",
};
const saved = { ...process.env };

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of Object.keys(process.env))
    if (k.startsWith("GOOGLE_") || k === "RESEND_API_KEY") delete process.env[k];
  Object.assign(process.env, base, env);
  return import("@/lib/env");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

describe("Google sign-in configuration", () => {
  it("is off when neither variable is set", async () => {
    const env = await load({});
    expect(env.isGoogleEnabled()).toBe(false);
  });
  it("is on when both are set", async () => {
    const env = await load({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    expect(env.isGoogleEnabled()).toBe(true);
  });
  it.each([{ GOOGLE_CLIENT_ID: "id" }, { GOOGLE_CLIENT_SECRET: "secret" }])(
    "refuses a half configuration %o, naming the variables but never values",
    async (half) => {
      const env = await load(half);
      expect(() => env.getEnv()).toThrow(/GOOGLE_CLIENT_ID \/ GOOGLE_CLIENT_SECRET: set both or neither/);
      try {
        env.getEnv();
      } catch (e) {
        expect(String(e)).not.toContain("secret");
      }
    },
  );
});

describe("core configuration", () => {
  it("reports problems by name only", async () => {
    const env = await load({ BETTER_AUTH_SECRET: "short-but-secret-ish", BETTER_AUTH_URL: "nope" });
    let message = "";
    try {
      env.getEnv();
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).toContain("BETTER_AUTH_URL");
    expect(message).not.toContain("short-but-secret-ish");
  });
});
