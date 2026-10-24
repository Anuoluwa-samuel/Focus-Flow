"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTaskDoneAction } from "@/app/(app)/tasks/actions";

export function CompactTasks({ tasks }: { tasks: { id: string; title: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="compact-tasks" className="mx-auto mt-12 w-full max-w-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="compact-tasks" className="text-sm font-semibold uppercase tracking-widest text-muted">
          Open tasks
        </h2>
        <Link href="/tasks" className="text-sm underline">
          Manage
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">
          No open tasks.{" "}
          <Link href="/tasks" className="underline">
            Add one
          </Link>{" "}
          to attach it to a session.
        </p>
      ) : (
        <ul className="grid gap-1">
          {tasks.slice(0, 5).map((t) => (
            <li key={t.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  onChange={async (e) => {
                    setError(null);
                    try {
                      const res = await setTaskDoneAction({ id: t.id, done: e.target.checked });
                      if (!res.ok) setError(res.message);
                      router.refresh();
                    } catch {
                      setError("Couldn't reach the server.");
                      e.target.checked = false;
                    }
                  }}
                />
                <span className="min-w-0 break-words">{t.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
