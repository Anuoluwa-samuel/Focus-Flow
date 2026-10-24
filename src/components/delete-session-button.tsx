"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSessionAction } from "@/app/(app)/history/actions";
import { Button } from "@/components/ui/button";

export function DeleteSessionButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm)
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        aria-label={`Delete ${label}`}
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-danger"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    );
  return (
    <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-sm">
      Delete?
      <Button
        variant="danger"
        className="min-h-9 px-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await deleteSessionAction({ id });
            if (!res.ok) setError(res.message);
            else router.refresh();
          } catch {
            setError("Couldn't reach the server.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Yes
      </Button>
      <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirm(false)}>
        No
      </Button>
      {error && <span className="text-danger">{error}</span>}
    </span>
  );
}
