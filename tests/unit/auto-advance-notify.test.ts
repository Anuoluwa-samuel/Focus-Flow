// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldAutoAdvance } from "@/domain/timer/auto-advance";
import { notificationPermission, playChime, readMuted, showNotification, writeMuted } from "@/lib/notify";

describe("shouldAutoAdvance", () => {
  const base = { autoTransition: true, endedStatus: "completed" as const, watchedLive: true };
  it("advances only when opted in, completed, and watched live", () => {
    expect(shouldAutoAdvance(base)).toBe(true);
    expect(shouldAutoAdvance({ ...base, autoTransition: false })).toBe(false);
    expect(shouldAutoAdvance({ ...base, watchedLive: false })).toBe(false); // tab reopened after the session ended
    for (const s of ["cancelled", "skipped", "abandoned", "running", "paused", undefined] as const) {
      expect(shouldAutoAdvance({ ...base, endedStatus: s })).toBe(false);
    }
  });
});

describe("notifications", () => {
  const original = globalThis.Notification;
  afterEach(() => {
    Object.defineProperty(globalThis, "Notification", { value: original, configurable: true, writable: true });
  });
  const stub = (permission: string, ctor = vi.fn()) => {
    const N = Object.assign(ctor, { permission });
    Object.defineProperty(globalThis, "Notification", { value: N, configurable: true, writable: true });
    return ctor;
  };

  it("shows a notification only when permission is granted", () => {
    const ctor = stub("granted");
    expect(showNotification("Focus complete", "Take a break")).toBe(true);
    expect(ctor).toHaveBeenCalledWith("Focus complete", expect.objectContaining({ body: "Take a break" }));
  });
  it.each(["denied", "default"])("does nothing and never prompts when permission is %s", (p) => {
    const ctor = stub(p);
    expect(showNotification("x", "y")).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });
  it("copes with browsers that have no Notification API or that throw", () => {
    Object.defineProperty(globalThis, "Notification", { value: undefined, configurable: true, writable: true });
    expect(notificationPermission()).toBe("unsupported");
    expect(showNotification("x", "y")).toBe(false);
    stub(
      "granted",
      vi.fn(() => {
        throw new TypeError("Illegal constructor");
      }),
    );
    expect(showNotification("x", "y")).toBe(false);
  });
});

describe("sound and mute", () => {
  beforeEach(() => localStorage.clear());
  it("never plays unless audio was primed by a user gesture", () => {
    expect(playChime()).toBe(false);
  });
  it("persists the mute choice and survives blocked storage", () => {
    expect(readMuted()).toBe(false);
    writeMuted(true);
    expect(readMuted()).toBe(true);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readMuted()).toBe(false);
    spy.mockRestore();
  });
});
