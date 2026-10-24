import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export const sessionTypeEnum = pgEnum("session_type", ["focus", "short_break", "long_break"]);
export const sessionStatusEnum = pgEnum("session_status", [
  "running",
  "paused",
  "completed",
  "cancelled",
  "skipped",
  "abandoned",
]);

/** One row per user, created with the account. Bounds mirror src/validators/preferences.ts. */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    focusMinutes: integer("focus_minutes").notNull().default(25),
    shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    sessionsBeforeLongBreak: integer("sessions_before_long_break").notNull().default(4),
    autoTransition: boolean("auto_transition").notNull().default(false),
    soundEnabled: boolean("sound_enabled").notNull().default(true),
    browserNotifications: boolean("browser_notifications").notNull().default(false),
    theme: themeEnum("theme").notNull().default("system"),
    timezone: text("timezone").notNull().default("UTC"),
    dailyGoalMinutes: integer("daily_goal_minutes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("prefs_focus_range", sql`${t.focusMinutes} BETWEEN 1 AND 180`),
    check("prefs_short_range", sql`${t.shortBreakMinutes} BETWEEN 1 AND 60`),
    check("prefs_long_range", sql`${t.longBreakMinutes} BETWEEN 1 AND 120`),
    check("prefs_cycle_range", sql`${t.sessionsBeforeLongBreak} BETWEEN 2 AND 12`),
    check("prefs_goal_range", sql`${t.dailyGoalMinutes} IS NULL OR ${t.dailyGoalMinutes} BETWEEN 5 AND 1440`),
  ],
);

export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("open"),
    priority: taskPriorityEnum("priority"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Listing a user's tasks by status/archive state, newest first.
    index("task_user_status_idx").on(t.userId, t.status, t.archivedAt, t.createdAt),
    check("task_title_len", sql`char_length(${t.title}) BETWEEN 1 AND 200`),
    check("task_desc_len", sql`${t.description} IS NULL OR char_length(${t.description}) <= 2000`),
  ],
);

/**
 * A timer run. A live row (running/paused) is the persisted timer; terminal rows are history.
 * Elapsed active time = accumulatedSeconds + (now - lastResumedAt) while running; see src/domain/timer.
 */
export const focusSession = pgTable(
  "focus_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // History survives task deletion; ownership is checked in the service layer.
    taskId: uuid("task_id").references(() => task.id, { onDelete: "set null" }),
    type: sessionTypeEnum("type").notNull(),
    status: sessionStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastResumedAt: timestamp("last_resumed_at", { withTimezone: true }),
    plannedSeconds: integer("planned_seconds").notNull(),
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    actualSeconds: integer("actual_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one live timer per user: makes concurrent "start" requests race-safe.
    uniqueIndex("focus_session_one_live_per_user")
      .on(t.userId)
      .where(sql`${t.status} IN ('running','paused')`),
    // History and analytics scans.
    index("focus_session_user_started_idx").on(t.userId, t.startedAt.desc()),
    // Per-task focus time.
    index("focus_session_user_task_idx").on(t.userId, t.taskId),
    check("fs_planned_range", sql`${t.plannedSeconds} BETWEEN 60 AND 28800`),
    check("fs_accumulated_nonneg", sql`${t.accumulatedSeconds} >= 0`),
    check("fs_ended_after_start", sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`),
    check("fs_terminal_has_end", sql`(${t.status} IN ('running','paused')) = (${t.endedAt} IS NULL)`),
    check("fs_running_has_resume", sql`${t.status} <> 'running' OR ${t.lastResumedAt} IS NOT NULL`),
  ],
);
