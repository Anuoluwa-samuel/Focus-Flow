/** Test database URL: same server as DATABASE_URL, separate database so dev data is never touched. */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL must be set (see .env.example)");
  const url = new URL(base);
  url.pathname = "/focusflow_test";
  return url.toString();
}
