import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, renders as the child element instead of a <button>. */
  asChild?: boolean;
  variant?: "primary" | "ghost";
}

const BASE_CLASSES =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50";

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent-strong text-on-accent hover:bg-accent-hover",
  ghost: "bg-transparent text-label-s hover:bg-surface-3",
};

/** Radix-Slot-based button primitive, styled exclusively via DESIGN.md tokens. */
export function Button({
  asChild = false,
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className ?? ""}`} {...props}>
      {children}
    </Comp>
  );
}
