# Timer engine

**Source of truth:** one `focus_session` row per run. Active time = `accumulated_seconds` + (server now − `last_resumed_at`) while running. The client never counts ticks; it renders `planned − active` from server timestamps plus a clock skew measured at each response (and re-measured on load, tab focus and reconnect).

**Writes:** only on start, pause, resume, reset, skip, complete, or stale recovery. Nothing is written per second and the client does not poll.

## State machine (`src/domain/timer/machine.ts`)
running → paused (pause) · paused → running (resume) · running → completed (complete, only when active ≥ planned − 2 s)
running/paused → cancelled (reset) · skipped (skip) · abandoned (stale). Terminal states accept no events.

## Rules
- **Credit:** only `completed` focus sessions count toward focus time. `cancelled`, `skipped` and `abandoned` store their `actual_seconds` for history but are excluded. Breaks never count as focus.
- **Completion** is idempotent: the row is locked (`FOR UPDATE`); a repeat on a completed session returns the stored result. A late completion is dated at the planned end, not at request time. Credit is capped at the planned duration.
- **Pause at/after the planned end** completes the session instead.
- **One live timer per user** is enforced by a partial unique index; concurrent starts yield one success and `CONFLICT` for the rest.
- **Stale recovery** (run whenever state is read or a new session starts): a running timer more than 1 h past its planned end, or a timer paused more than 24 h, becomes `abandoned` and earns no completion credit.
- **Next type:** after focus → short break, or long break on every Nth completed focus since the last long break; after a break → focus; reset/abandoned repeat the type.
- Pause/resume drop sub-second remainders (floor), so each pause can lose under 1 s of credit.

## Recovery matrix
| Situation | Behaviour |
|---|---|
| Refresh / reopened tab | Page renders from the DB row; the timer continues |
| Tab in background / device sleep | Display re-derived from timestamps on focus/visibility; server decides completion |
| Offline when time ends | Client retries completion (4 attempts, backoff, idempotent); timer stays visible with a Retry link; on reconnect it resyncs |
| Wrong device clock | Skew is measured against the server clock; the server alone decides completion |
| Duplicate/concurrent completion | One completed row |
| Logout while running | Row persists; the timer is there on next login (subject to stale rules) |
| Midnight / timezone change | Timestamps are UTC; day bucketing by the user's timezone comes with analytics (Phase 5) |

## Limitations
A running timer is trusted to have run because the user never paused it; a browser cannot prove attention. The server cannot tell sleep from focus. Skew measurement has an error of about one network round trip.
