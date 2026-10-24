"use client";

import { Button } from "@/components/ui/button";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">The problem has been logged. Nothing you saved was lost.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
