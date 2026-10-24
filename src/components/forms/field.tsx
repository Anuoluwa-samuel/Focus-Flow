import type { InputHTMLAttributes } from "react";
type FieldError = { message?: string };

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: FieldError; hint?: string };

export function Field({ label, error, hint, id, ...input }: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined}
        className="min-h-11 rounded-lg border border-border bg-raised px-3 text-base"
        {...input}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
