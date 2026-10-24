import { describe, expect, it } from "vitest";
import { preferencesSchema } from "@/validators/preferences";
import { createTaskSchema, listTasksSchema, updateTaskSchema } from "@/validators/task";
import { loginSchema, registerSchema } from "@/validators/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

const validPrefs = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoTransition: false,
  soundEnabled: true,
  browserNotifications: false,
  theme: "system",
  timezone: "Africa/Lagos",
  dailyGoalMinutes: "",
};

describe("preferencesSchema", () => {
  it("accepts defaults, coerces form strings and maps an empty goal to null", () => {
    const out = preferencesSchema.parse({ ...validPrefs, focusMinutes: "30" });
    expect(out.focusMinutes).toBe(30);
    expect(out.dailyGoalMinutes).toBeNull();
  });
  it.each([
    ["focusMinutes", 0],
    ["focusMinutes", 181],
    ["focusMinutes", 1.5],
    ["shortBreakMinutes", 61],
    ["longBreakMinutes", 121],
    ["sessionsBeforeLongBreak", 1],
    ["sessionsBeforeLongBreak", 13],
    ["dailyGoalMinutes", 4],
    ["dailyGoalMinutes", 1441],
    ["focusMinutes", "abc"],
    ["focusMinutes", -5],
  ])("rejects %s = %s", (key, value) => {
    expect(preferencesSchema.safeParse({ ...validPrefs, [key]: value }).success).toBe(false);
  });
  it("rejects unknown timezone, bad theme, and unexpected keys (no mass assignment)", () => {
    expect(preferencesSchema.safeParse({ ...validPrefs, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...validPrefs, theme: "neon" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...validPrefs, userId: "someone-else" }).success).toBe(false);
  });
});

describe("task schemas", () => {
  it("trims, normalizes empties to null, and bounds lengths", () => {
    const t = createTaskSchema.parse({ title: "  Read chapter 3  ", description: "", priority: null, dueDate: "" });
    expect(t).toEqual({ title: "Read chapter 3", description: null, priority: null, dueDate: null });
    expect(createTaskSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "ok", description: "x".repeat(2001) }).success).toBe(false);
  });
  it("rejects invalid dates and priorities", () => {
    expect(createTaskSchema.safeParse({ title: "a", dueDate: "2026-13-40" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "a", dueDate: "tomorrow" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "a", priority: "urgent" }).success).toBe(false);
  });
  it("update requires a uuid and refuses extra fields such as userId or status", () => {
    expect(updateTaskSchema.safeParse({ id: "1" }).success).toBe(false);
    const id = "3f1c2a64-52a3-4c45-9a52-4b6a1a4f2d11";
    expect(updateTaskSchema.safeParse({ id, userId: "x" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ id, status: "done" }).success).toBe(false);
    expect(updateTaskSchema.parse({ id, title: "New" })).toEqual({ id, title: "New" });
  });
  it("list query falls back safely on invalid filters", () => {
    expect(listTasksSchema.parse({ status: "bogus", priority: "nope", page: "-3" })).toEqual({
      status: "open",
      priority: undefined,
      page: 1,
    });
    expect(listTasksSchema.parse({ status: "done", page: "2" })).toMatchObject({ status: "done", page: 2 });
    expect(listTasksSchema.parse({ page: "9999999" }).page).toBe(1);
  });
});

describe("auth schemas", () => {
  it("normalizes email and enforces password length", () => {
    expect(loginSchema.parse({ email: "  USER@Example.COM ", password: "x" }).email).toBe("user@example.com");
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(
      registerSchema.safeParse({ name: "A", email: "not-an-email", password: "long-enough-password" }).success,
    ).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "x".repeat(129) }).success).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil",
    "",
    null,
    undefined,
    "/ok\n//evil",
  ])("falls back for %s", (input) => expect(safeRedirectPath(input as string)).toBe("/dashboard"));
  it("allows same-site paths", () => {
    expect(safeRedirectPath("/tasks?status=done")).toBe("/tasks?status=done");
  });
});
