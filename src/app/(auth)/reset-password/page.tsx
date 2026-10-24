import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <ResetPasswordForm token={typeof token === "string" ? token : undefined} />
    </>
  );
}
