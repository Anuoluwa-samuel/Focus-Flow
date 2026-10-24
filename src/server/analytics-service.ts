import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { focusSession, task } from "@/db/schema";
import { getDb } from "@/lib/db";
import { addDays, localDateKey, normalizeTimeZone, startOfIsoWeek, startOfLocalDay } from "@/domain/dates";
import { computeStreaks, type Streaks } from "@/domain/streaks";
import { getPreferences } from "./preferences";

/**
 * Metric definitions (shared by every number on the analytics page):
 * - Focus time: sum of actual_seconds of COMPLETED sessions of type focus. Breaks, cancelled, skipped and abandoned never count.
 * - A session belongs to the local day (user's timezone) on which it STARTED.
 * - Completion rate: completed focus sessions / all ended focus sessions (completed + cancelled + skipped + abandoned).
 * - Streak: consecutive local days with at least one completed focus session; today may still be empty.
 * Only one timer can be live per user (DB constraint), so sessions never overlap and nothing is double counted.
 */

type Clock = { now?: Date };

const COMPLETED_FOCUS = (userId: string) =>
  and(eq(focusSession.userId, userId), eq(focusSession.type, "focus"), eq(focusSession.status, "completed"));

// The timezone is validated by normalizeTimeZone (charset + Intl), so inlining it as a literal is safe.
// It cannot be a bind parameter: GROUP BY must match the SELECT expression textually.
const localTs = (tz: string) => sql`(${focusSession.startedAt} AT TIME ZONE ${sql.raw(`'${tz}'`)})`;
const localDay = (tz: string) => sql<string>`(${localTs(tz)})::date::text`;

async function completedDayKeys(userId: string, tz: string, now: Date): Promise<string[]> {
  // Bounded lookback keeps the query cheap; best streak is therefore "within the last ~3 years".
  const since = new Date(now.getTime() - 1100 * 86_400_000);
  const rows = await getDb()
    .selectDistinct({ day: localDay(tz) })
    .from(focusSession)
    .where(and(COMPLETED_FOCUS(userId), gte(focusSession.startedAt, since)));
  return rows.map((r) => r.day);
}

export async function getStreaks(userId: string, { now = new Date() }: Clock = {}): Promise<Streaks> {
  const tz = normalizeTimeZone((await getPreferences(userId)).timezone);
  return computeStreaks(await completedDayKeys(userId, tz, now), localDateKey(now, tz));
}

export type TodaySummary = {
  sessions: number;
  focusSeconds: number;
  goalSeconds: number | null;
  streak: Streaks;
  timezone: string;
};

export async function getTodaySummary(userId: string, { now = new Date() }: Clock = {}): Promise<TodaySummary> {
  const prefs = await getPreferences(userId);
  const tz = normalizeTimeZone(prefs.timezone);
  const todayKey = localDateKey(now, tz);
  const from = startOfLocalDay(todayKey, tz);
  const to = startOfLocalDay(addDays(todayKey, 1), tz);

  const [row] = await getDb()
    .select({
      sessions: sql<number>`count(*)::int`,
      seconds: sql<number>`coalesce(sum(${focusSession.actualSeconds}), 0)::int`,
    })
    .from(focusSession)
    .where(and(COMPLETED_FOCUS(userId), gte(focusSession.startedAt, from), sql`${focusSession.startedAt} < ${to}`));

  return {
    sessions: row.sessions,
    focusSeconds: row.seconds,
    goalSeconds: prefs.dailyGoalMinutes ? prefs.dailyGoalMinutes * 60 : null,
    streak: computeStreaks(await completedDayKeys(userId, tz, now), todayKey),
    timezone: tz,
  };
}

export type Analytics = {
  timezone: string;
  days: number;
  from: string; // first local day in range
  to: string; // today (local)
  totals: {
    sessions: number;
    focusSeconds: number;
    avgSeconds: number | null;
    endedFocusSessions: number;
    completionRate: number | null;
  };
  daily: { day: string; seconds: number; sessions: number }[]; // only days that have data
  weekly: { week: string; seconds: number; sessions: number }[]; // last 8 ISO weeks with data
  weekdays: { isoDow: number; seconds: number; sessions: number }[]; // 1=Mon..7=Sun, only with data
  byTask: { taskId: string | null; title: string | null; seconds: number; sessions: number }[];
  streak: Streaks;
};

export async function getAnalytics(
  userId: string,
  { days }: { days: number },
  { now = new Date() }: Clock = {},
): Promise<Analytics> {
  const db = getDb();
  const tz = normalizeTimeZone((await getPreferences(userId)).timezone);
  const todayKey = localDateKey(now, tz);
  const fromKey = addDays(todayKey, -(days - 1));
  const rangeStart = startOfLocalDay(fromKey, tz);
  const inRange = and(gte(focusSession.startedAt, rangeStart));
  const secs = sql<number>`coalesce(sum(${focusSession.actualSeconds}), 0)::int`;
  const n = sql<number>`count(*)::int`;

  const [totals] = await db
    .select({
      sessions: sql<number>`(count(*) filter (where ${focusSession.status} = 'completed'))::int`,
      seconds: sql<number>`coalesce(sum(${focusSession.actualSeconds}) filter (where ${focusSession.status} = 'completed'), 0)::int`,
      ended: n,
    })
    .from(focusSession)
    .where(
      and(
        eq(focusSession.userId, userId),
        eq(focusSession.type, "focus"),
        sql`${focusSession.status} not in ('running','paused')`,
        inRange,
      ),
    );

  const daily = await db
    .select({ day: localDay(tz), seconds: secs, sessions: n })
    .from(focusSession)
    .where(and(COMPLETED_FOCUS(userId), inRange))
    .groupBy(localDay(tz))
    .orderBy(localDay(tz));

  const weekStartKey = addDays(startOfIsoWeek(todayKey), -7 * 7); // 8 ISO weeks including the current one
  const weekExpr = sql<string>`date_trunc('week', ${localTs(tz)})::date::text`;
  const weekly = await db
    .select({ week: weekExpr, seconds: secs, sessions: n })
    .from(focusSession)
    .where(and(COMPLETED_FOCUS(userId), gte(focusSession.startedAt, startOfLocalDay(weekStartKey, tz))))
    .groupBy(weekExpr)
    .orderBy(weekExpr);

  const dow = sql<number>`extract(isodow from ${localTs(tz)})::int`;
  const weekdays = await db
    .select({ isoDow: dow, seconds: secs, sessions: n })
    .from(focusSession)
    .where(and(COMPLETED_FOCUS(userId), inRange))
    .groupBy(dow)
    .orderBy(dow);

  const byTask = await db
    .select({ taskId: focusSession.taskId, title: task.title, seconds: secs, sessions: n })
    .from(focusSession)
    .leftJoin(task, and(eq(task.id, focusSession.taskId), eq(task.userId, focusSession.userId)))
    .where(and(COMPLETED_FOCUS(userId), inRange))
    .groupBy(focusSession.taskId, task.title)
    .orderBy(desc(secs), task.title) // title breaks ties so the order is stable
    .limit(10);

  return {
    timezone: tz,
    days,
    from: fromKey,
    to: todayKey,
    totals: {
      sessions: totals.sessions,
      focusSeconds: totals.seconds,
      avgSeconds: totals.sessions > 0 ? Math.round(totals.seconds / totals.sessions) : null,
      endedFocusSessions: totals.ended,
      completionRate: totals.ended > 0 ? totals.sessions / totals.ended : null,
    },
    daily,
    weekly,
    weekdays,
    byTask,
    streak: computeStreaks(await completedDayKeys(userId, tz, now), todayKey),
  };
}
