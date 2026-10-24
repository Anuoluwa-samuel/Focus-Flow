/** Accepts only same-origin relative paths; anything else falls back. Blocks `//host`, `/\host`, and schemes. */
export function safeRedirectPath(input: string | null | undefined, fallback = "/dashboard"): string {
  if (!input) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(input)) return fallback;
  return input;
}
