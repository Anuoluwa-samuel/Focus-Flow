"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/validators/auth";
import { Button } from "@/components/ui/button";
import { Field } from "./field";

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        const { error } = await authClient.signIn.email(values);
        if (error) {
          // One message for wrong password, unknown email, or unverified email (resent automatically by the server).
          setError(
            error.status === 403
              ? "Please verify your email first. We sent a fresh link."
              : error.status === 429
                ? "Too many attempts. Please wait a minute and try again."
                : "Incorrect email or password.",
          );
          return;
        }
        router.replace(safeRedirectPath(next));
        router.refresh();
      })}
    >
      <FormError message={error} />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email}
        {...form.register("email")}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.password}
        {...form.register("password")}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted">
        <Link className="underline" href="/forgot-password">
          Forgot your password?
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/register">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });

  if (done)
    return (
      <Notice title="Check your email">
        If that address can be used, a verification link is on its way. It expires in 24 hours.
      </Notice>
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        const { error } = await authClient.signUp.email({ ...values, callbackURL: "/dashboard" });
        if (error?.status === 429) return setError("Too many attempts. Please try again later.");
        if (error && error.status !== 422) return setError("We could not create the account. Please try again.");
        setDone(true); // identical outcome for new and already-registered addresses
      })}
    >
      <FormError message={error} />
      <Field id="name" label="Name" autoComplete="name" error={form.formState.errors.name} {...form.register("name")} />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email}
        {...form.register("email")}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={form.formState.errors.password}
        {...form.register("password")}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link className="underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  if (done)
    return (
      <Notice title="Check your email">
        If an account exists for that address, a reset link is on its way. It expires in one hour.
      </Notice>
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async ({ email }) => {
        setError(null);
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (error?.status === 429) return setError("Too many attempts. Please try again later.");
        setDone(true);
      })}
    >
      <FormError message={error} />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email}
        {...form.register("email")}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "" } });

  if (!token)
    return (
      <Notice title="This link is not valid">
        Request a new one from the{" "}
        <Link className="underline" href="/forgot-password">
          forgot password
        </Link>{" "}
        page.
      </Notice>
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        setError(null);
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        if (error) return setError("This link has expired or was already used. Request a new one.");
        router.replace("/login");
      })}
    >
      <FormError message={error} />
      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={form.formState.errors.password}
        {...form.register("password")}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}
