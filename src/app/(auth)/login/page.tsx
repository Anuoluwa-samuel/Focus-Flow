import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/auth-forms";
import { isGoogleEnabled } from "@/lib/env";
export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Sign in</h1>
      {/* Any OAuth failure shows one generic message; the error code in the URL is never echoed back. */}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          We couldn&apos;t sign you in with Google. If you already have an account, sign in with your email and
          password.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} googleEnabled={isGoogleEnabled()} />
    </>
  );
}
