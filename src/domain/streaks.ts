import { addDays } from "./dates";

export type Streaks = { current: number; best: number };

/**
 * A streak is a run of consecutive local days that each have at least one completed focus session.
 * The current streak stays alive through today: if nothing is done yet today, a run ending yesterday still counts.
 */
export function computeStreaks(dayKeys: Iterable<string>, todayKey: string): Streaks {
  const days = Array.from(new Set(dayKeys)).sort();
  if (days.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === addDays(days[i - 1], 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const set = new Set(days);
  let cursor = set.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}
