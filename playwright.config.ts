import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const DEV_PORT = 3250; // functional journeys: dev server + dedicated test database + file email outbox
const PROD_PORT = 3251; // header/cache checks against a real production build
const base = new URL(process.env.DATABASE_URL ?? "postgres://focusflow:focusflow@localhost:54330/focusflow");
base.pathname = "/focusflow_e2e";
export const E2E_DATABASE_URL = base.toString();
export const OUTBOX = ".e2e-outbox.jsonl";

const baseEnv = {
  ...process.env,
  DATABASE_URL: E2E_DATABASE_URL,
  EMAIL_OUTBOX_FILE: OUTBOX,
  RESEND_API_KEY: "",
} as Record<string, string>;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/helpers/global-setup.ts",
  fullyParallel: false,
  workers: 1, // tests share one database and one IP-based rate limiter
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "desktop",
      testIgnore: /(headers|mobile)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: `http://127.0.0.1:${DEV_PORT}` },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], channel: "chrome", baseURL: `http://127.0.0.1:${DEV_PORT}` },
    },
    { name: "production-headers", testMatch: /headers\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${PROD_PORT}` } },
  ],
  webServer: [
    {
      command: `pnpm exec next dev -p ${DEV_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${DEV_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...baseEnv, BETTER_AUTH_URL: `http://127.0.0.1:${DEV_PORT}`, NODE_ENV: "development" },
    },
    {
      // Dummy Resend key: production requires one. These tests never register users, so nothing is sent.
      command: `pnpm exec next build && pnpm exec next start -p ${PROD_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PROD_PORT}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...baseEnv,
        RESEND_API_KEY: "re_dummy_not_used",
        BETTER_AUTH_URL: `http://127.0.0.1:${PROD_PORT}`,
        NODE_ENV: "production",
      },
    },
  ],
});
