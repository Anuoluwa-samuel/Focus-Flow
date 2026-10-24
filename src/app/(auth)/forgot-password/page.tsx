import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/auth-forms";
export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Reset your password</h1>
      <ForgotPasswordForm />
    </>
  );
}
