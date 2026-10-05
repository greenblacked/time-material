import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet" | "ghost";
  children: ReactNode;
};

export function Button({
  variant = "quiet",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const on = props["aria-pressed"] === true || props["aria-checked"] === true;
  return (
    <button
      type={type}
      className={cn(
        "press inline-flex h-11 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "solid" && "bg-ink text-canvas",
        variant === "quiet" && "border border-line bg-canvas text-ink hover:bg-inset",
        variant === "ghost" && "bg-transparent text-ink hover:bg-inset",
        on && variant !== "solid" && "is-on",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "press inline-flex size-11 items-center justify-center rounded-sm border border-line bg-canvas text-ink hover:bg-inset",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
