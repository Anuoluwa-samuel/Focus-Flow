import Link from "next/link";
import { BarChart3, CheckSquare, Clock, Keyboard, ShieldCheck, Smartphone } from "lucide-react";
import { TimerDisplay } from "@/components/timer/timer-display";

const FEATURES = [
  {
    icon: Clock,
    title: "A timer you can trust",
    body: "Remaining time comes from saved timestamps, not a counter. Refresh, close the tab or let your laptop sleep and it picks up where it should.",
  },
  {
    icon: CheckSquare,
    title: "Tasks that connect to focus",
    body: "Pick what you are working on before you start, then see how much focused time each task has received.",
  },
  {
    icon: BarChart3,
    title: "Honest statistics",
    body: "Only completed focus sessions count. Skipped, reset and break time never inflate your numbers, and days follow your own timezone.",
  },
  {
    icon: Smartphone,
    title: "Works on any screen",
    body: "A large, legible timer and touch-sized controls on phones, tablets and desktops, in light or dark.",
  },
  {
    icon: Keyboard,
    title: "Built to be accessible",
    body: "Keyboard operable, visible focus, respects reduced motion, and announces state changes without reading out every second.",
  },
  {
    icon: ShieldCheck,
    title: "Your data stays yours",
    body: "Everything is private to your account, and you can delete sessions or your whole account yourself.",
  },
];

const STEPS = [
  { n: "1", title: "Choose a task", body: "Optional, but it makes your history more useful." },
  { n: "2", title: "Start a session", body: "Focus for the length you set, then take a short or long break." },
  { n: "3", title: "Review your progress", body: "See today's focus time, streaks, and trends over days and weeks." },
];

const SECURITY = [
  "Passwords are hashed by the authentication library (scrypt); we never store or log them.",
  "Sessions use HttpOnly cookies (marked Secure in production) and can be revoked; changing your password signs out other devices.",
  "Sign-in, sign-up and password reset are rate limited, and we do not reveal whether an email is registered.",
  "Every task, session and setting is checked against your account on the server, not just hidden in the interface.",
  "A strict Content Security Policy and other security headers are applied to every page.",
  "There are no advertising or third-party analytics trackers. The only email we send is for verification, password reset and account deletion.",
];

export default function Home() {
  return (
    <main id="main" className="flex-1">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Focus on one thing at a time.
          </h1>
          <p className="max-w-prose text-lg text-muted">
            FocusFlow is a calm focus timer with tasks, session history and clear statistics, so you can see where your
            attention actually goes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center rounded-lg bg-accent px-6 font-medium text-accent-foreground hover:opacity-90"
            >
              Start focusing
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center rounded-lg border border-border-strong px-6 font-medium hover:bg-surface"
            >
              Sign in
            </Link>
          </div>
        </div>
        <figure
          className="rounded-card border border-border bg-surface p-6 shadow-card"
          aria-label="Preview of the focus timer"
        >
          <div aria-hidden="true">
            <TimerDisplay type="focus" remainingSeconds={18 * 60 + 42} plannedSeconds={25 * 60} status="running" />
          </div>
          <figcaption className="mt-4 text-center text-sm text-muted">
            A focus session in progress, 18 minutes 42 seconds remaining.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="features" className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-4 py-14">
          <h2 id="features" className="text-2xl font-semibold tracking-tight">
            What you get
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-2">
                <Icon className="size-5 text-accent" aria-hidden="true" />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto w-full max-w-5xl px-4 py-14">
        <h2 id="how" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold"
              >
                {s.n}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="privacy" className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-4 py-14">
          <h2 id="privacy" className="text-2xl font-semibold tracking-tight">
            Privacy and security
          </h2>
          <ul className="mt-6 grid gap-3 text-sm md:grid-cols-2">
            {SECURITY.map((t) => (
              <li key={t} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-prose text-sm text-muted">
            No system is perfectly secure and FocusFlow has not been independently audited or certified. Read the{" "}
            <Link className="underline" href="/privacy">
              privacy notice
            </Link>{" "}
            for what we store and why.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Ready for your first session?</h2>
        <Link
          href="/register"
          className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-accent px-6 font-medium text-accent-foreground hover:opacity-90"
        >
          Create a free account
        </Link>
      </section>
    </main>
  );
}
