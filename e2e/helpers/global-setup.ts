import { rmSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

export default async function globalSetup() {
  const { E2E_DATABASE_URL, OUTBOX } = await import("../../playwright.config");
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = 'focusflow_e2e'");
  if (exists.rowCount === 0) await admin.query("create database focusflow_e2e");
  await admin.end();

  const pool = new Pool({ connectionString: E2E_DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve("src/db/migrations") });
  // Start every run from an empty database.
  await pool.query('truncate "user", rate_limit restart identity cascade');
  await pool.end();
  rmSync(OUTBOX, { force: true });
}
