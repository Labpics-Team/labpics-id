import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, renders as the child element instead of a <button>. */
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost";
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
  "inline-flex min-h-touch items-center justify-center gap-lab-8 rounded-md px-lab-16 text-input font-medium transition-controls active:scale-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed";

/*
 * Figma baseline (FIGMA-BASELINE.md §1.4):
 * - primary = accent anchor + top-light gradient + inset bottom shadow
 *   (bg-accent-finish); hover swaps the base to the derived hover fill.
 *   Disabled loses the finish entirely: border-ink 8% wash + label-q text
 *   (login-default frame) — not the generic opacity dim, because the CTA is
 *   the sole gradient carrier and a translucent gradient reads broken.
 * - secondary = card surface with the 16%-ink control border (social,
 *   passkeys, back). Disabled keeps the border and dims per §6.3.
 * - ghost = quiet inline action (unchanged).
 */
const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent-finish text-on-accent hover:bg-accent-finish-hover disabled:bg-accent-finish-disabled disabled:text-label-q",
  secondary:
    "border border-border-strong bg-surface text-label-p hover:bg-surface-3 disabled:opacity-disabled",
  ghost: "bg-transparent text-label-s hover:bg-surface-3 disabled:opacity-disabled",
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
