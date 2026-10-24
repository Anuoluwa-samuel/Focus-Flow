# Analytics definitions

| Metric | Definition |
|---|---|
| Focus time | Sum of `actual_seconds` of **completed** `focus` sessions. Breaks, reset, skipped and abandoned sessions never count. |
| Sessions | Count of completed focus sessions |
| Average | Focus time / sessions (shown as "—" when there are none) |
| Completion rate | completed focus / all *ended* focus sessions (completed + reset + skipped + expired). A running or paused timer is not yet counted. |
| Streak | Consecutive local days with at least one completed focus session. Today may still be empty without breaking the current streak. Best streak looks back about 3 years (1100 days). |
| Day | The local calendar day in the user's timezone on which the session **started**. A session that crosses midnight counts once, on its start day. |
| Week | ISO week, Monday start |
| Most productive days | Focus time grouped by weekday within the selected range |

**Implementation.** Everything is computed by SQL aggregates (`GROUP BY` on `started_at AT TIME ZONE <tz>`), never by loading history into the browser. Only one timer can be live per user (partial unique index), so sessions cannot overlap. Day boundaries for filters and "today" come from `src/domain/dates.ts`, which handles DST (23h/25h days) and half-hour offsets; both have unit tests.

**Charts.** Days with no completed focus inside the selected range are drawn as empty (they are true zeros), but no chart is drawn at all when the range has no data; an empty state explains why instead. Every chart repeats its values as text and as a screen-reader table.

**Limitations.** Changing your timezone re-buckets history on the next view (data is stored in UTC and never rewritten). PostgreSQL's and the browser's timezone databases can differ for very recent rule changes.
