import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/auth-forms";
export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
