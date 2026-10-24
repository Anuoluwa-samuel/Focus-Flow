/**
 * Runs once when a server instance starts. Fails fast on missing or malformed configuration so a bad deploy
 * stops here with a clear message (variable names only, never values) instead of failing on the first user request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return; // builds must not need secrets
  const { getEnv } = await import("./lib/env");
  getEnv();
}
