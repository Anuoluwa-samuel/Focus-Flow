"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** "Continue with Google" plus an "or" divider. Rendered only when the server has Google configured. */
export function GoogleSignIn({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: safeRedirectPath(next),
        errorCallbackURL: "/login",
      });
      // On success the browser is redirected to Google, so there is nothing more to do here.
      if (error) {
        setError(
          error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : "Google sign-in is unavailable right now.",
        );
        setPending(false);
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Button type="button" variant="ghost" onClick={go} disabled={pending} className="w-full">
        <GoogleLogo />
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
