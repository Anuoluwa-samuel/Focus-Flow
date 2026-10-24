"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { profileSchema } from "@/validators/preferences";
import { resetSchema } from "@/validators/auth";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-4 rounded-card border border-border bg-raised p-5 shadow-card">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Message({ m }: { m: { kind: "ok" | "error"; text: string } | null }) {
  if (!m) return null;
  return (
    <p
      role={m.kind === "error" ? "alert" : "status"}
      className={m.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}
    >
      {m.text}
    </p>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name } });
  return (
    <Card title="Profile">
      <p className="text-sm text-muted">Signed in as {email}</p>
      <form
        noValidate
        className="grid gap-3"
        onSubmit={form.handleSubmit(async (v) => {
          const { error } = await authClient.updateUser({ name: v.name });
          setMsg(error ? { kind: "error", text: "Couldn't update your name." } : { kind: "ok", text: "Name updated." });
          if (!error) router.refresh();
        })}
      >
        <Field
          id="profile-name"
          label="Name"
          autoComplete="name"
          error={form.formState.errors.name}
          {...form.register("name")}
        />
        <div>
          <Button type="submit" variant="ghost" disabled={form.formState.isSubmitting}>
            Save name
          </Button>
        </div>
        <Message m={msg} />
      </form>
    </Card>
  );
}

const passwordSchema = resetSchema.extend({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
});

export function PasswordForm() {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: "", password: "" } });
  return (
    <Card title="Password">
      <form
        noValidate
        className="grid gap-3"
        onSubmit={form.handleSubmit(async (v) => {
          setMsg(null);
          // revokeOtherSessions signs out every other device after a password change.
          const { error } = await authClient.changePassword({
            currentPassword: v.currentPassword,
            newPassword: v.password,
            revokeOtherSessions: true,
          });
          if (error)
            return setMsg({
              kind: "error",
              text:
                error.status === 429 ? "Too many attempts. Try again later." : "Your current password is incorrect.",
            });
          form.reset();
          setMsg({ kind: "ok", text: "Password changed. Other devices were signed out." });
        })}
      >
        <Field
          id="current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.currentPassword}
          {...form.register("currentPassword")}
        />
        <Field
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          error={form.formState.errors.password}
          {...form.register("password")}
        />
        <div>
          <Button type="submit" variant="ghost" disabled={form.formState.isSubmitting}>
            Change password
          </Button>
        </div>
        <Message m={msg} />
      </form>
    </Card>
  );
}

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password").max(128),
  confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }),
});

export function DeleteAccountForm() {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const form = useForm({
    resolver: zodResolver(deleteSchema),
    defaultValues: { password: "", confirm: "" as "DELETE" },
  });
  return (
    <Card title="Delete account">
      <p className="text-sm text-muted">
        This permanently removes your account, tasks, sessions and history. For safety we confirm your password and then
        email you a link that completes the deletion. It cannot be undone.
      </p>
      <form
        noValidate
        className="grid gap-3"
        onSubmit={form.handleSubmit(async (v) => {
          setMsg(null);
          const { error } = await authClient.deleteUser({ password: v.password, callbackURL: "/" });
          if (error)
            return setMsg({
              kind: "error",
              text: error.status === 429 ? "Too many attempts. Try again later." : "Your password is incorrect.",
            });
          form.reset();
          setMsg({
            kind: "ok",
            text: "Check your email and open the confirmation link to finish deleting your account.",
          });
        })}
      >
        <Field
          id="delete-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password}
          {...form.register("password")}
        />
        <Field
          id="delete-confirm"
          label='Type "DELETE" to confirm'
          autoComplete="off"
          error={form.formState.errors.confirm}
          {...form.register("confirm")}
        />
        <div>
          <Button type="submit" variant="danger" disabled={form.formState.isSubmitting}>
            Send deletion link
          </Button>
        </div>
        <Message m={msg} />
      </form>
    </Card>
  );
}
