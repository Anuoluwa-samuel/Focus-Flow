import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { testDatabaseUrl } from "./test-db";

export default async function setup() {
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = 'focusflow_test'");
  if (exists.rowCount === 0) await admin.query("create database focusflow_test");
  await admin.end();

  const pool = new Pool({ connectionString: testDatabaseUrl() });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, "../../src/db/migrations") });
  await pool.end();
}
