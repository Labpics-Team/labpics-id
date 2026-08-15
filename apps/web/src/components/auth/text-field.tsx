"use client";

import type { InputHTMLAttributes } from "react";
import { useId, useState } from "react";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "placeholder"> {
  label: string;
  /** Error helper text; presence switches the field to its error state. */
  error?: string | undefined;
}

/*
 * Floating-label text field (Figma Input component, 48px control, radius-md):
 * the label rests centered at input size and floats to caption size at the
 * top when the field has focus or a value. Border = 16%-ink control border;
 * per FIGMA-BASELINE.md §3.4 the boundary signal is carried by the focus
 * ring (accent, ≥3:1), not the resting border. Error state swaps the border
 * to the sentiment anchor and announces the helper via aria-describedby +
 * role=alert (never color-alone: text carries the message).
 */
export function TextField({ label, error, value, onFocus, onBlur, ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [focused, setFocused] = useState(false);
  const hasValue = typeof value === "string" && value.length > 0;
  const floated = focused || hasValue;
  const invalid = error !== undefined;

  return (
    <div className="flex flex-col gap-lab-4">
      <div className="relative">
        <label
          htmlFor={id}
          className={
            floated
              ? "field-label-float text-caption text-label-t transition-controls"
              : "field-label-rest text-input text-label-t transition-controls"
          }
        >
          {label}
        </label>
        <input
          id={id}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className={`h-control w-full rounded-md border bg-surface px-lab-16 pt-lab-16 pb-lab-4 text-input text-label-p transition-controls focus-visible:shadow-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-disabled ${
            invalid ? "border-error" : "border-border-strong"
          }`}
          {...props}
        />
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="text-caption text-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
