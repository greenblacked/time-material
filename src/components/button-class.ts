import { cn } from "@/lib/cn";

export type ButtonVariant = "solid" | "quiet" | "ghost";

export const VARIANT_CLASS: Record<ButtonVariant, string> = {
  solid: "btn-primary",
  quiet: "btn-quiet",
  ghost: "btn-ghost",
};

/** Class list for a button-styled element, shared by <Button> and link buttons. */
export function buttonClass(variant: ButtonVariant = "quiet", className?: string) {
  return cn("btn", VARIANT_CLASS[variant], className);
}
