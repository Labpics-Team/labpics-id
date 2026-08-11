import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, renders as the child element instead of a <button>. */
  asChild?: boolean;
  variant?: "primary" | "ghost";
}

/*
 * Every class below traces to a DESIGN.md token: spacing = --lab-space-*
 * (px-lab-16), size = --lab-size-touch (min-h-touch), type role = --lab-text-
 * label (text-label carries size + weight 500 + tracking), transition =
 * transition-controls (explicit property allow-list + --lab-motion-instant),
 * press = scale-press (--lab-press-scale 0.97), focus = 2px outline in
 * --lab-focus-color with 2px offset, disabled = --lab-opacity-disabled.
 * Default Tailwind namespaces are wiped in globals.css, so an untraced
 * utility would not compile to anything.
 */
const BASE_CLASSES =
  "inline-flex min-h-touch items-center justify-center rounded-md px-lab-16 text-label transition-controls active:scale-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-disabled disabled:cursor-not-allowed";

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
