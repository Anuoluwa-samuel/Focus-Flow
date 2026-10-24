import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        FocusFlow
      </Link>
      <div className="rounded-card border border-border bg-raised p-6 shadow-card">{children}</div>
    </main>
  );
}
