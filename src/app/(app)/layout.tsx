import Link from "next/link";
import { Nav } from "@/components/nav";
import { SignOutButton } from "@/components/sign-out-button";
import { getPreferences } from "@/server/preferences";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  return (
    // Explicit light/dark choice overrides the OS setting; "system" leaves the attribute off.
    <div
      data-theme={prefs.theme === "system" ? undefined : prefs.theme}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight">
            FocusFlow
          </Link>
          <Nav />
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
