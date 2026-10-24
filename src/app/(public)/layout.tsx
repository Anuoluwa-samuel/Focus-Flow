import Link from "next/link";

const linkCls =
  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted hover:text-foreground";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-2 px-4 py-2">
          <Link href="/" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight">
            FocusFlow
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1">
            <Link href="/login" className={linkCls}>
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <p>© {new Date().getFullYear()} FocusFlow</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-2">
            <Link href="/privacy" className={linkCls}>
              Privacy
            </Link>
            <Link href="/terms" className={linkCls}>
              Terms
            </Link>
            <Link href="/support" className={linkCls}>
              Support
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
