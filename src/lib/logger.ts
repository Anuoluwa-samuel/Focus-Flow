import "server-only";

const REDACT = /pass(word)?|token|secret|authorization|cookie|email|api[-_]?key|url/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : scrub(v, depth + 1)]),
    );
  }
  return value;
}

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(ctx ? { ctx: scrub(ctx) } : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

/** Structured JSON logs with sensitive keys redacted. Pass error *names/codes*, never raw request bodies. */
export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
