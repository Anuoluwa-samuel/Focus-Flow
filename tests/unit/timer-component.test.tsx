// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../helpers/dom";
import type { TimerState } from "@/types/timer";

const actions = vi.hoisted(() => ({
  startTimerAction: vi.fn(),
  pauseTimerAction: vi.fn(),
  resumeTimerAction: vi.fn(),
  completeTimerAction: vi.fn(),
  resetTimerAction: vi.fn(),
  skipTimerAction: vi.fn(),
}));
vi.mock("@/app/(app)/dashboard/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { Timer } from "@/components/timer/timer";

const idle: TimerState = {
  active: null,
  serverNow: new Date().toISOString(),
  nextType: "focus",
  durations: { focus: 1500, short_break: 300, long_break: 900 },
  ended: null,
};
const prefs = { soundEnabled: true, browserNotifications: false, autoTransition: false };
const running = (over = {}): TimerState => ({
  ...idle,
  active: {
    id: "11111111-1111-4111-8111-111111111111",
    type: "focus",
    status: "running",
    plannedSeconds: 1500,
    accumulatedSeconds: 0,
    lastResumedAt: new Date().toISOString(),
    taskId: null,
    ...over,
  },
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 500 })),
  );
  Object.values(actions).forEach((f) => f.mockReset());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Timer", () => {
  it("starts the selected session type with the chosen task", async () => {
    actions.startTimerAction.mockResolvedValue({ ok: true, data: running() });
    const user = userEvent.setup();
    render(<Timer initial={idle} tasks={[{ id: "t1", title: "Essay" }]} prefs={prefs} />);
    expect(screen.getByTestId("clock")).toHaveTextContent("25:00");
    await user.selectOptions(screen.getByLabelText("Working on"), "t1");
    await user.click(screen.getByRole("button", { name: /start focus/i }));
    expect(actions.startTimerAction).toHaveBeenCalledWith({ type: "focus", taskId: "t1" });
    expect(await screen.findByRole("button", { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Session started.");
  });

  it("lets keyboard users change session type with radio semantics and shows that type's duration", async () => {
    const user = userEvent.setup();
    render(<Timer initial={idle} tasks={[]} prefs={prefs} />);
    await user.click(screen.getByRole("radio", { name: "Short break" }));
    expect(screen.getByRole("radio", { name: "Short break" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("clock")).toHaveTextContent("05:00");
  });

  it("keeps the timer and shows a retryable message when the network fails", async () => {
    actions.pauseTimerAction.mockRejectedValue(new TypeError("fetch failed"));
    const user = userEvent.setup();
    render(<Timer initial={running()} tasks={[]} prefs={prefs} />);
    await user.click(screen.getByRole("button", { name: /pause/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
    expect(screen.getByRole("button", { name: /pause/i })).toBeEnabled(); // still running, can retry
  });

  it("shows a server-side rejection without losing state", async () => {
    actions.skipTimerAction.mockResolvedValue({
      ok: false,
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
    });
    const user = userEvent.setup();
    render(<Timer initial={running()} tasks={[]} prefs={prefs} />);
    await user.click(screen.getByRole("button", { name: /skip/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
  });

  it("completes an overdue session exactly once and shows the visual result", async () => {
    const overdue = running({ lastResumedAt: new Date(Date.now() - 1500_000).toISOString() });
    actions.completeTimerAction.mockResolvedValue({
      ok: true,
      data: {
        ...idle,
        nextType: "short_break",
        ended: { id: "x", type: "focus", status: "completed", actualSeconds: 1500 },
      },
    });
    render(<Timer initial={overdue} tasks={[]} prefs={prefs} />);
    await waitFor(() => expect(screen.getByText(/Focus complete/)).toBeInTheDocument());
    expect(actions.completeTimerAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/25:00 recorded/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Short break" })).toHaveAttribute("aria-checked", "true"); // suggested next
  });

  it("offers a mute toggle only when sound is enabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Timer initial={idle} tasks={[]} prefs={prefs} />);
    const mute = screen.getByRole("button", { name: /mute sound/i });
    await user.click(mute);
    expect(screen.getByRole("button", { name: /sound muted/i })).toHaveAttribute("aria-pressed", "true");
    rerender(<Timer initial={idle} tasks={[]} prefs={{ ...prefs, soundEnabled: false }} />);
    expect(screen.queryByRole("button", { name: /mute/i })).toBeNull();
  });
});
