"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePreferencesAction } from "@/app/(app)/settings/actions";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { preferencesSchema, type PreferencesFormInput } from "@/validators/preferences";

type Props = { initial: PreferencesFormInput };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-card border border-border bg-raised p-5 shadow-card">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      {description && <p className="-mt-2 text-sm text-muted">{description}</p>}
      {children}
    </fieldset>
  );
}

function Toggle({
  id,
  label,
  hint,
  ...rest
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-5 accent-[var(--accent)]"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function PreferencesForm({ initial }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([initial.timezone]);
  const form = useForm<PreferencesFormInput>({ resolver: zodResolver(preferencesSchema), defaultValues: initial });
  const { errors, isSubmitting, isDirty } = form.formState;

  // Populated after mount: the browser's list can differ from the server's, which would break hydration.
  useEffect(() => {
    const id = setTimeout(() => {
      const all =
        (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
      setZones(Array.from(new Set(["UTC", initial.timezone, ...all])));
    }, 0);
    return () => clearTimeout(id);
  }, [initial.timezone]);

  const notifField = form.register("browserNotifications");

  async function onNotificationsChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNotice(null);
    if (!e.target.checked) return notifField.onChange(e);
    if (typeof Notification === "undefined") {
      form.setValue("browserNotifications", false);
      return setNotice(
        "This browser doesn't support notifications. The timer still works and shows an on-screen message when a session ends.",
      );
    }
    // Permission is requested only now, because the user explicitly turned the option on.
    const permission =
      Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      form.setValue("browserNotifications", false, { shouldDirty: true });
      return setNotice(
        "Notifications are blocked for this site. You can allow them in your browser's site settings, then turn this on again.",
      );
    }
    notifField.onChange(e);
  }

  return (
    <form
      noValidate
      aria-label="Preferences"
      className="grid gap-6"
      onSubmit={form.handleSubmit(async (values) => {
        setStatus(null);
        try {
          const res = await updatePreferencesAction(values);
          if (!res.ok) return setStatus({ kind: "error", text: res.message });
          setStatus({ kind: "ok", text: "Preferences saved." });
          form.reset(values);
          router.refresh();
        } catch {
          setStatus({ kind: "error", text: "Couldn't reach the server. Your changes are still here; try again." });
        }
      })}
    >
      <Section title="Timer" description="Durations apply to sessions you start from now on.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="focus"
            label="Focus (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            error={errors.focusMinutes}
            {...form.register("focusMinutes")}
          />
          <Field
            id="short"
            label="Short break (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            error={errors.shortBreakMinutes}
            {...form.register("shortBreakMinutes")}
          />
          <Field
            id="long"
            label="Long break (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            error={errors.longBreakMinutes}
            {...form.register("longBreakMinutes")}
          />
          <Field
            id="cycle"
            label="Focus sessions before a long break"
            type="number"
            inputMode="numeric"
            min={2}
            max={12}
            error={errors.sessionsBeforeLongBreak}
            {...form.register("sessionsBeforeLongBreak")}
          />
        </div>
        <Toggle
          id="auto"
          label="Start the next session automatically"
          hint="Only when this page is open and watched the session end. A tab reopened later never starts a session by itself."
          {...form.register("autoTransition")}
        />
      </Section>

      <Section title="Goal">
        <Field
          id="goal"
          label="Daily focus goal (minutes, optional)"
          type="number"
          inputMode="numeric"
          min={5}
          max={1440}
          hint="Leave empty for no goal."
          error={errors.dailyGoalMinutes}
          {...form.register("dailyGoalMinutes")}
        />
      </Section>

      <Section
        title="Sound and notifications"
        description="Neither is required. The timer works the same without them."
      >
        <Toggle
          id="sound"
          label="Play a sound when a session ends"
          hint="Sound only plays after you have interacted with the page, never on load."
          {...form.register("soundEnabled")}
        />
        <Toggle
          id="notif"
          label="Show a browser notification when a session ends"
          hint="Your browser will ask for permission when you turn this on. Notifications may not appear if the browser or device has fully suspended this page."
          {...notifField}
          onChange={onNotificationsChange}
        />
        {notice && (
          <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
            {notice}
          </p>
        )}
      </Section>

      <Section title="Appearance and time">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="theme" className="text-sm font-medium">
            Theme
          </label>
          <select
            id="theme"
            className="min-h-11 rounded-lg border border-border bg-raised px-3 text-base"
            {...form.register("theme")}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tz" className="text-sm font-medium">
            Timezone
          </label>
          <select
            id="tz"
            className="min-h-11 rounded-lg border border-border bg-raised px-3 text-base"
            aria-describedby="tz-hint"
            {...form.register("timezone")}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p id="tz-hint" className="text-xs text-muted">
            Sets which day a session belongs to.{" "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                form.setValue("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone, { shouldDirty: true })
              }
            >
              Use this device&apos;s timezone
            </button>
          </p>
          {errors.timezone && (
            <p role="alert" className="text-sm text-danger">
              {errors.timezone.message}
            </p>
          )}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save preferences"}
        </Button>
        <p
          role={status?.kind === "error" ? "alert" : "status"}
          className={status?.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {status?.text}
        </p>
      </div>
    </form>
  );
}
