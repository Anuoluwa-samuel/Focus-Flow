/** Timezone-aware date helpers. Timestamps are stored in UTC; "days" always mean days in the user's timezone. */

const SAFE_TZ = /^[A-Za-z0-9_+\-/]{1,64}$/;

export function normalizeTimeZone(tz: string): string {
  if (!SAFE_TZ.test(tz)) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}

/** YYYY-MM-DD of the instant as seen in `tz`. */
export function localDateKey(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export const isDateKey = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** Adds whole calendar days to a date key (pure calendar arithmetic, no DST involved). */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The UTC instant at which local calendar day `key` begins in `tz` (handles DST and half-hour offsets). */
export function startOfLocalDay(key: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  const corrected = guess - offsetMs(new Date(t), tz);
  if (corrected !== t) t = corrected;
  return new Date(t);
}

/** Monday of the ISO week containing `key`. */
export function startOfIsoWeek(key: string): string {
  const dow = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
  return addDays(key, -dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Every date key from `from` to `to` inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 400; k = addDays(k, 1)) out.push(k);
  return out;
}
