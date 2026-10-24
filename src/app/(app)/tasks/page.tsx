import type { Metadata } from "next";
import Link from "next/link";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskRow, type TaskItem } from "@/components/tasks/task-row";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/session";
import { listTasks } from "@/server/task-service";
import { listTasksSchema } from "@/validators/task";

export const metadata: Metadata = { title: "Tasks" };

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;
const PRIORITIES = [
  { value: "", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const query = listTasksSchema.parse({
    status: first(raw.status),
    priority: first(raw.priority),
    page: first(raw.page),
  });
  const { items, hasMore } = await listTasks(user.id, query);

  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: query.status, priority: query.priority, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && String(v) !== "") p.set(k, String(v));
    const qs = p.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };

  const rows: TaskItem[] = items.map((t) => ({
    ...t,
    dueAt: t.dueAt?.toISOString() ?? null,
    archivedAt: t.archivedAt?.toISOString() ?? null,
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Tasks</h1>
      <TaskForm />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Task status" className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s.value}
              href={href({ status: s.value })}
              aria-current={query.status === s.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium",
                query.status === s.value ? "bg-accent-soft" : "text-muted hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <form action="/tasks" className="flex items-center gap-2">
          <input type="hidden" name="status" value={query.status} />
          <label htmlFor="priority-filter" className="sr-only">
            Filter by priority
          </label>
          <select
            id="priority-filter"
            name="priority"
            defaultValue={query.priority ?? ""}
            className="min-h-11 rounded-lg border border-border bg-raised px-3 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface">
            Apply
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-border p-10 text-center">
          <p className="font-medium">
            {query.status === "open" && !query.priority ? "Nothing to do yet" : "No tasks match these filters"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {query.status === "open" && !query.priority ? (
              "Add a task above, then pick it before you start a focus session."
            ) : (
              <Link className="underline" href="/tasks">
                Clear filters
              </Link>
            )}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((t) => (
            <TaskRow key={t.id} item={t} />
          ))}
        </ul>
      )}

      {(query.page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {query.page > 1 ? (
            <Link className="underline" href={href({ page: query.page - 1 })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Page {query.page}</span>
          {hasMore ? (
            <Link className="underline" href={href({ page: query.page + 1 })}>
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
