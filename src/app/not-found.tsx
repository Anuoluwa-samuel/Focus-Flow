import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <p className="font-mono text-5xl text-muted">404</p>
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground"
      >
        Go home
      </Link>
    </main>
  );
}
