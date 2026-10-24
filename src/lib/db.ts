import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { getEnv } from "./env";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const url = getEnv().DATABASE_URL;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new Pool({
    connectionString: url,
    max: 5,
    // Managed providers require TLS; local Docker does not offer it.
    ssl: local ? false : { rejectUnauthorized: true },
  });
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Lazy so importing this module never opens a connection at build time. */
export function getDb() {
  globalForDb.pgPool ??= createPool();
  _db ??= drizzle(globalForDb.pgPool, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
