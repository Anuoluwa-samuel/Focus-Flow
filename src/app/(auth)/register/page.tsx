import type { Metadata } from "next";
import { RegisterForm } from "@/components/forms/auth-forms";
import { isGoogleEnabled } from "@/lib/env";
export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Create your account</h1>
      <RegisterForm googleEnabled={isGoogleEnabled()} />
    </>
  );
}
