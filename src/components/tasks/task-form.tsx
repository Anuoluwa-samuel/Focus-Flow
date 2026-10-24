"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskAction } from "@/app/(app)/tasks/actions";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { createTaskSchema } from "@/validators/task";

type Values = {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | null;
  dueDate?: string | null;
};

export function TaskForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(createTaskSchema) as never,
    defaultValues: { title: "", description: "", priority: null, dueDate: "" },
  });

  return (
    <form
      noValidate
      aria-label="Add a task"
      className="grid gap-3 rounded-card border border-border bg-raised p-4 shadow-card sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          const res = await createTaskAction(values);
          if (!res.ok) return setError(res.message);
          form.reset();
          router.refresh();
        } catch {
          setError("Couldn't reach the server. Please try again.");
        }
      })}
    >
      <Field
        id="task-title"
        label="New task"
        placeholder="What are you working on?"
        maxLength={200}
        error={form.formState.errors.title}
        {...form.register("title")}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="task-priority" className="text-sm font-medium">
          Priority
        </label>
        <select
          id="task-priority"
          className="min-h-11 rounded-lg border border-border bg-raised px-3 text-base"
          {...form.register("priority", { setValueAs: (v) => v || null })}
        >
          <option value="">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <Field
        id="task-due"
        label="Due"
        type="date"
        error={form.formState.errors.dueDate}
        {...form.register("dueDate")}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Add task
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}
