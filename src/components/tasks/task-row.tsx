"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import {
  deleteTaskAction,
  setTaskArchivedAction,
  setTaskDoneAction,
  updateTaskAction,
} from "@/app/(app)/tasks/actions";
import { formatClock } from "@/domain/timer/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "done";
  priority: "low" | "medium" | "high" | null;
  dueAt: string | null; // ISO
  archivedAt: string | null;
  focusSeconds: number;
};

const PRIORITY_LABEL = { low: "Low priority", medium: "Medium priority", high: "High priority" } as const;

export function TaskRow({ item }: { item: TaskItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = item.status === "done";
  const archived = item.archivedAt !== null;

  async function run(call: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await call();
      if (!res.ok) setError(res.message ?? "That didn't work.");
      else {
        setEditing(false);
        setConfirmDelete(false);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-card border border-border bg-raised p-4">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              updateTaskAction({
                id: item.id,
                title: String(f.get("title") ?? ""),
                description: String(f.get("description") ?? ""),
                priority: String(f.get("priority") ?? "") || null,
                dueDate: String(f.get("dueDate") ?? "") || null,
              }),
            );
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Title
            <input
              name="title"
              defaultValue={item.title}
              required
              maxLength={200}
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-base font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Description
            <textarea
              name="description"
              defaultValue={item.description ?? ""}
              maxLength={2000}
              rows={3}
              className="rounded-lg border border-border bg-background px-3 py-2 text-base font-normal"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Priority
              <select
                name="priority"
                defaultValue={item.priority ?? ""}
                className="min-h-11 rounded-lg border border-border bg-background px-3 text-base font-normal"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Due
              <input
                name="dueDate"
                type="date"
                defaultValue={item.dueAt?.slice(0, 10) ?? ""}
                className="min-h-11 rounded-lg border border-border bg-background px-3 text-base font-normal"
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-card border border-border bg-raised p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy || archived}
          onChange={(e) => void run(() => setTaskDoneAction({ id: item.id, done: e.target.checked }))}
          aria-label={`Mark "${item.title}" ${done ? "not done" : "done"}`}
          className="mt-1 size-5 accent-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("break-words font-medium", done && "text-muted line-through")}>{item.title}</p>
          {item.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{item.description}</p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {item.priority && <span>{PRIORITY_LABEL[item.priority]}</span>}
            {item.dueAt && (
              <span>
                Due {new Date(item.dueAt).toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" })}
              </span>
            )}
            <span>{item.focusSeconds > 0 ? `${formatClock(item.focusSeconds)} focused` : "No focus time yet"}</span>
            {archived && <span>Archived</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!archived && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit "${item.title}"`}
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => setTaskArchivedAction({ id: item.id, archived: !archived }))}
            aria-label={`${archived ? "Restore" : "Archive"} "${item.title}"`}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-foreground"
          >
            {archived ? (
              <ArchiveRestore className="size-4" aria-hidden="true" />
            ) : (
              <Archive className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete((v) => !v)}
            aria-label={`Delete "${item.title}"`}
            aria-expanded={confirmDelete}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-danger/10 px-3 py-2 text-sm">
          <span>Delete this task permanently? Its focus sessions stay in your history.</span>
          <Button
            variant="danger"
            className="min-h-9"
            disabled={busy}
            onClick={() => void run(() => deleteTaskAction({ id: item.id }))}
          >
            Delete
          </Button>
          <Button variant="ghost" className="min-h-9" onClick={() => setConfirmDelete(false)}>
            Keep
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
