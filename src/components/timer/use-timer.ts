"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeTimerAction,
  pauseTimerAction,
  resetTimerAction,
  resumeTimerAction,
  skipTimerAction,
  startTimerAction,
} from "@/app/(app)/dashboard/actions";
import { shouldAutoAdvance } from "@/domain/timer/auto-advance";
import { SESSION_LABEL } from "@/domain/timer/format";
import { remainingSeconds } from "@/domain/timer/machine";
import { playChime, primeAudio, readMuted, showNotification, writeMuted } from "@/lib/notify";
import type { ActionResult } from "@/lib/errors";
import type { SessionType } from "@/domain/timer/machine";
import type { TimerState } from "@/types/timer";

const NETWORK_MESSAGE = "Couldn't reach the server. Your timer is safe; try again when you're back online.";

export type Announcement = string;

/**
 * Client-side timer: presentation and interaction only.
 * Elapsed time is always derived from server timestamps (+ a skew measured at each response), never from counting ticks.
 */
export type TimerPrefs = { soundEnabled: boolean; browserNotifications: boolean; autoTransition: boolean };

export function useTimer(initial: TimerState, prefs: TimerPrefs) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.serverNow)); // pure initial value: identical on server and client
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // serverTime - clientTime, measured at each response. Starts at 0 and is corrected by the mount-time resync below.
  const [skew, setSkew] = useState(0);
  const completing = useRef<string | null>(null);
  const watched = useRef<string | null>(null); // session this page saw counting down
  const lastTaskId = useRef<string | null>(null);
  const prefsRef = useRef(prefs);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    const id = setTimeout(() => setMuted(readMuted()), 0); // localStorage is browser-only; read after mount
    return () => clearTimeout(id);
  }, []);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      writeMuted(!m);
      return !m;
    });
  }, []);

  const apply = useCallback(
    (next: TimerState, say?: string, keepEnded = false) => {
      setSkew(new Date(next.serverNow).getTime() - Date.now());
      // A background resync must not erase the "session complete" message the user has not dismissed yet.
      setState((prev) => (keepEnded && !next.ended ? { ...next, ended: prev.ended } : next));
      setNow(Date.now());
      setError(null);
      if (say) setAnnouncement(say);
      if (next.ended) router.refresh(); // server-rendered "Today" numbers change when a session ends
    },
    [router],
  );

  const active = state.active;
  const serverTime = new Date(now + skew);
  const remaining = active
    ? remainingSeconds(
        {
          status: active.status,
          plannedSeconds: active.plannedSeconds,
          accumulatedSeconds: active.accumulatedSeconds,
          lastResumedAt: active.lastResumedAt ? new Date(active.lastResumedAt) : null,
        },
        serverTime,
      )
    : 0;

  // Re-render a few times a second only while running; the value shown is still computed from timestamps.
  useEffect(() => {
    if (active?.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active?.status, active?.id]);

  const resync = useCallback(async () => {
    try {
      const res = await fetch("/api/timer", { cache: "no-store" });
      if (res.status === 401) return void router.replace("/login");
      if (res.ok) apply(await res.json(), undefined, true);
    } catch {
      /* offline: keep showing the last known timestamps */
    }
  }, [apply, router]);

  const run = useCallback(
    async (call: () => Promise<ActionResult<TimerState>>, say: (s: TimerState) => string) => {
      setPending(true);
      try {
        const res = await call();
        if (res.ok) apply(res.data, say(res.data));
        else {
          setError(res.message);
          if (res.code === "CONFLICT" || res.code === "NOT_FOUND" || res.code === "TOO_EARLY") await resync();
        }
      } catch {
        setError(NETWORK_MESSAGE); // state left untouched: nothing is lost
      } finally {
        setPending(false);
      }
    },
    [apply, resync],
  );

  // Measure the clock skew as soon as the page is interactive, so a wrong device clock never affects the countdown.
  useEffect(() => {
    const id = setTimeout(() => void resync(), 0);
    return () => clearTimeout(id);
  }, [resync]);

  // Reconcile after the tab becomes visible, the window regains focus, or connectivity returns (sleep, background throttling).
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [resync]);

  // Auto-complete once per session when the countdown reaches zero. Retries are safe: completion is idempotent.
  const complete = useCallback(
    async (sessionId: string) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await completeTimerAction({ sessionId });
          if (res.ok) {
            apply(res.data, res.data.ended?.status === "completed" ? "Session complete." : "Session ended.");
            const ended = res.data.ended;
            if (ended?.status === "completed") {
              const p = prefsRef.current;
              const mutedNow = readMuted();
              if (p.soundEnabled && !mutedNow) playChime();
              if (p.browserNotifications && document.visibilityState !== "visible") {
                showNotification(`${SESSION_LABEL[ended.type]} complete`, "Open FocusFlow to start your next session.");
              }
              if (
                shouldAutoAdvance({
                  autoTransition: p.autoTransition,
                  endedStatus: ended.status,
                  watchedLive: watched.current === sessionId,
                })
              ) {
                const type = res.data.nextType;
                const wantTask = type === "focus" ? lastTaskId.current : null;
                let next = await startTimerAction({ type, taskId: wantTask });
                if (!next.ok && wantTask) next = await startTimerAction({ type, taskId: null });
                if (next.ok) apply(next.data, `${SESSION_LABEL[type]} started.`);
              }
            }
            return true;
          }
          if (res.code === "TOO_EARLY") {
            await resync();
            return false;
          }
          setError(res.message);
          await resync();
          return false;
        } catch {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
      setError(NETWORK_MESSAGE);
      return false;
    },
    [apply, resync],
  );

  useEffect(() => {
    if (active?.status === "running" && remaining > 0) watched.current = active.id;
    if (active?.status === "running" && remaining <= 0 && completing.current !== active.id) {
      completing.current = active.id;
      void complete(active.id).then((done) => {
        if (!done) completing.current = null; // allow a manual retry via the button below
      });
    }
  }, [active, remaining, complete]);

  const act = {
    start: (type: SessionType, taskId?: string | null) => {
      primeAudio(); // user gesture: allows the end-of-session chime later
      lastTaskId.current = taskId ?? null;
      return run(
        () => startTimerAction({ type, taskId: taskId ?? null }),
        () => "Session started.",
      );
    },
    pause: () =>
      active &&
      run(
        () => pauseTimerAction({ sessionId: active.id }),
        (s) => (s.ended ? "Session complete." : "Paused."),
      ),
    resume: () =>
      active &&
      (primeAudio(),
      run(
        () => resumeTimerAction({ sessionId: active.id }),
        () => "Resumed.",
      )),
    reset: () =>
      active &&
      run(
        () => resetTimerAction({ sessionId: active.id }),
        () => "Session reset.",
      ),
    skip: () =>
      active &&
      run(
        () => skipTimerAction({ sessionId: active.id }),
        () => "Session skipped.",
      ),
    retryComplete: () => {
      if (!active) return;
      completing.current = active.id;
      void complete(active.id);
    },
  };

  return {
    state,
    active,
    remaining,
    pending,
    error,
    announcement,
    act,
    muted,
    toggleMute,
    dismissEnded: () => setState((s) => ({ ...s, ended: null })),
  };
}
