export type ErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "TOO_EARLY" | "RATE_LIMITED" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  TOO_EARLY: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Error whose message is safe to show to the user. Anything else is reported as a generic failure. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

/** Predictable result shape for server actions and route handlers. */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export function toFailure(
  err: unknown,
  log: (msg: string, ctx?: Record<string, unknown>) => void,
): ActionResult<never> {
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message, fieldErrors: err.fieldErrors };
  }
  log("unhandled server error", { name: err instanceof Error ? err.name : typeof err });
  return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
}
