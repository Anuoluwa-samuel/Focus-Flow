import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify your email" };

export default function Page() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
      <p className="text-sm text-muted">Open the link we emailed you to activate your account, then sign in.</p>
    </div>
  );
}
