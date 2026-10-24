// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../helpers/dom";
import { TimerDisplay } from "@/components/timer/timer-display";

afterEach(cleanup);

describe("TimerDisplay", () => {
  it("shows the formatted remaining time and session label", () => {
    render(<TimerDisplay type="focus" remainingSeconds={1499.2} plannedSeconds={1500} status="running" />);
    expect(screen.getByTestId("clock")).toHaveTextContent("25:00");
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("states the paused status in text, not only colour", () => {
    render(<TimerDisplay type="short_break" remainingSeconds={120} plannedSeconds={300} status="paused" />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Short break")).toBeInTheDocument();
  });

  it("is not a live region, so the countdown is never announced each second", () => {
    const { container } = render(<TimerDisplay type="focus" remainingSeconds={60} plannedSeconds={60} status="idle" />);
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
