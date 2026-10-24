"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { formatClock, SESSION_LABEL } from "@/domain/timer/format";
import type { SessionType } from "@/domain/timer/machine";
import type { TimerState } from "@/types/timer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TimerDisplay } from "./timer-display";
import { useTimer, type TimerPrefs } from "./use-timer";

const TYPES: SessionType[] = ["focus", "short_break", "long_break"];

export type PickerTask = { id: string; title: string };

export function Timer({ initial, tasks, prefs }: { initial: TimerState; tasks: PickerTask[]; prefs: TimerPrefs }) {
  const { state, active, remaining, pending, error, announcement, act, dismissEnded, muted, toggleMute } = useTimer(
    initial,
    prefs,
  );
  const root = useRef<HTMLElement>(null);
  const [fsSupported, setFsSupported] = useState(false);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFsSupported(Boolean(document.fullscreenEnabled)), 0);
    const onChange = () => setIsFs(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      clearTimeout(id);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      /* denied or unsupported: the timer works the same without it */
    }
  }
  const [choice, setChoice] = useState<SessionType | null>(null);
  const [taskId, setTaskId] = useState<string>("");
  const selected = choice ?? state.nextType; // follows the suggested next type until the user picks one

  // Tab title carries the countdown so it is visible in the background.
  useEffect(() => {
    if (!active) return;
    document.title = `${formatClock(remaining)} · ${SESSION_LABEL[active.type]} · FocusFlow`;
    return () => void (document.title = "Dashboard · FocusFlow");
  }, [active, remaining]);

  const type = active?.type ?? selected;
  const planned = active?.plannedSeconds ?? state.durations[type];
  const overdue = active?.status === "running" && remaining <= 0;

  return (
    <section
      ref={root}
      aria-labelledby="timer-heading"
      className={cn("flex flex-col items-center gap-8", isFs && "justify-center overflow-auto bg-background p-6")}
    >
      <h1 id="timer-heading" className="sr-only">
        Focus timer
      </h1>

      {!active && (
        <div
          role="radiogroup"
          aria-label="Session type"
          className="inline-flex rounded-full border border-border bg-surface p-1"
        >
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected === t}
              onClick={() => setChoice(t)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-medium transition-colors",
                selected === t ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {SESSION_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {!active && selected === "focus" && tasks.length > 0 && (
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <label htmlFor="focus-task" className="text-sm font-medium">
            Working on
          </label>
          <select
            id="focus-task"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-raised px-3 text-base"
          >
            <option value="">No specific task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {active?.taskId && (
        <p className="text-sm text-muted">
          Working on:{" "}
          <span className="font-medium text-foreground">
            {tasks.find((t) => t.id === active.taskId)?.title ?? "a task"}
          </span>
        </p>
      )}

      <TimerDisplay
        type={type}
        plannedSeconds={planned}
        remainingSeconds={active ? remaining : planned}
        status={active?.status ?? "idle"}
      />

      <div className="flex flex-wrap items-center justify-center gap-3">
        {!active && (
          <Button
            onClick={() => {
              void act.start(selected, selected === "focus" ? taskId || null : null);
              setChoice(null);
            }}
            disabled={pending}
            className="min-w-40"
          >
            <Play className="size-4" aria-hidden="true" /> Start {SESSION_LABEL[selected].toLowerCase()}
          </Button>
        )}
        {active?.status === "running" && (
          <Button onClick={() => act.pause()} disabled={pending || overdue} className="min-w-32">
            <Pause className="size-4" aria-hidden="true" /> Pause
          </Button>
        )}
        {active?.status === "paused" && (
          <Button onClick={() => act.resume()} disabled={pending} className="min-w-32">
            <Play className="size-4" aria-hidden="true" /> Resume
          </Button>
        )}
        {active && (
          <>
            <Button variant="ghost" onClick={() => act.reset()} disabled={pending}>
              <RotateCcw className="size-4" aria-hidden="true" /> Reset
            </Button>
            <Button variant="ghost" onClick={() => act.skip()} disabled={pending}>
              <SkipForward className="size-4" aria-hidden="true" /> Skip
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {prefs.soundEnabled && (
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:text-foreground"
          >
            {muted ? (
              <VolumeX className="size-4" aria-hidden="true" />
            ) : (
              <Volume2 className="size-4" aria-hidden="true" />
            )}
            {muted ? "Sound muted" : "Mute sound"}
          </button>
        )}
        {fsSupported && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-pressed={isFs}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:text-foreground"
          >
            {isFs ? (
              <Minimize className="size-4" aria-hidden="true" />
            ) : (
              <Maximize className="size-4" aria-hidden="true" />
            )}
            {isFs ? "Exit full screen" : "Full screen"}
          </button>
        )}
      </div>

      {overdue && (
        <p className="text-sm text-muted">
          Finishing up…{" "}
          <button className="underline" onClick={() => act.retryComplete()}>
            Retry
          </button>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="max-w-sm rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger"
        >
          {error}
        </p>
      )}

      {state.ended && (
        <div className="flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <p>
            {SESSION_LABEL[state.ended.type]}{" "}
            {state.ended.status === "completed"
              ? "complete"
              : state.ended.status === "abandoned"
                ? "expired and was not counted"
                : state.ended.status}
            {state.ended.status === "completed" || state.ended.actualSeconds > 0
              ? ` · ${formatClock(state.ended.actualSeconds)} recorded`
              : ""}
            .
          </p>
          <button className="ml-auto underline" onClick={dismissEnded}>
            Dismiss
          </button>
        </div>
      )}

      {/* Announced only on state changes, never on every tick. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
