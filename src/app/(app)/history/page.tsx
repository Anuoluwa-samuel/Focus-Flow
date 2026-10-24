import type { Metadata } from "next";
import Link from "next/link";
import { DeleteSessionButton } from "@/components/delete-session-button";
import { formatDuration, SESSION_LABEL } from "@/domain/timer/format";
import { listHistory, listTaskOptions } from "@/server/history-service";
import { requireUser } from "@/server/session";
import { historyQuerySchema } from "@/validators/history";

export const metadata: Metadata = { title: "History" };

const STATUS_LABEL = { completed: "Completed", cancelled: "Reset", skipped: "Skipped", abandoned: "Expired" } as const;

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const user = await requireUser();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const input = {
    from: first(raw.from),
    to: first(raw.to),
    type: first(raw.type),
    status: first(raw.status),
    taskId: first(raw.taskId),
    page: first(raw.page),
  };
  const q = historyQuerySchema.parse(input);
  const droppedDates = (input.from && !q.from) || (input.to && !q.to);
  const [{ items, hasMore, timezone }, taskOptions] = await Promise.all([
    listHistory(user.id, q),
    listTaskOptions(user.id),
  ]);

  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      from: q.from,
      to: q.to,
      type: q.type,
      status: q.status,
      taskId: q.taskId,
      page: page > 1 ? page : undefined,
    }))
      if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/history?${s}` : "/history";
  };
  const filtered = Boolean(q.from || q.to || q.type || q.status || q.taskId);
  const fmt = new Intl.DateTimeFormat("en", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
  const sel = "min-h-11 rounded-lg border border-border bg-raised px-3 text-sm";

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">History</h1>

      <form
        action="/history"
        className="grid gap-3 rounded-card border border-border bg-raised p-4 shadow-card sm:grid-cols-3 sm:items-end"
        aria-label="Filter history"
      >
        <label className="grid gap-1 text-sm font-medium">
          From
          <input type="date" name="from" defaultValue={q.from} className={sel} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To
          <input type="date" name="to" defaultValue={q.to} className={sel} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Type
          <select name="type" defaultValue={q.type ?? ""} className={sel}>
            <option value="">All</option>
            <option value="focus">Focus</option>
            <option value="short_break">Short break</option>
            <option value="long_break">Long break</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Status
          <select name="status" defaultValue={q.status ?? ""} className={sel}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Task
          <select name="taskId" defaultValue={q.taskId ?? ""} className={sel}>
            <option value="">All</option>
            {taskOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground">
          Apply
        </button>
      </form>
      {droppedDates && (
        <p role="status" className="mt-3 text-sm text-muted">
          One of the dates wasn&apos;t valid and was ignored.
        </p>
      )}
      <p className="mt-3 text-xs text-muted">Times are shown in {timezone}. Change this in Settings.</p>

      {items.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-border p-10 text-center">
          <p className="font-medium">{filtered ? "No sessions match these filters" : "No finished sessions yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {filtered ? (
              <Link className="underline" href="/history">
                Clear filters
              </Link>
            ) : (
              <>
                Start one on the{" "}
                <Link className="underline" href="/dashboard">
                  timer
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-raised shadow-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Finished sessions, newest first</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Task
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Planned
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Actual
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const when = fmt.format(s.startedAt);
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{when}</td>
                    <td className="px-4 py-3">{SESSION_LABEL[s.type]}</td>
                    <td className="max-w-48 truncate px-4 py-3 text-muted">{s.taskTitle ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDuration(s.plannedSeconds)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDuration(s.actualSeconds ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={s.status === "completed" ? "font-medium text-success" : "text-muted"}>
                        {s.status === "completed" ? "✓ " : ""}
                        {STATUS_LABEL[s.status as keyof typeof STATUS_LABEL]}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <DeleteSessionButton id={s.id} label={`${SESSION_LABEL[s.type]} session from ${when}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(q.page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {q.page > 1 ? (
            <Link className="underline" href={href(q.page - 1)}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Page {q.page}</span>
          {hasMore ? (
            <Link className="underline" href={href(q.page + 1)}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
