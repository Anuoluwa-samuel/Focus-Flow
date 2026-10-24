import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors duration-[var(--duration)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-foreground hover:opacity-90",
        variant === "ghost" && "border border-border bg-transparent hover:bg-surface",
        variant === "danger" && "bg-danger text-accent-foreground hover:opacity-90",
        className,
      )}
    />
  );
}
