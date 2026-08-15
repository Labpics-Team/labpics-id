"use client";

import { useId, useRef, useState } from "react";

export const OTP_LENGTH = 6;

export interface OtpFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Fires once when the value reaches OTP_LENGTH digits. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /** Error helper text; presence switches all cells to the error border. */
  error?: string | undefined;
}

/*
 * OTP input (Figma frame 1563:7321 + DESIGN-BRIEF A4): ONE real input for
 * accessibility — inputmode=numeric, autocomplete=one-time-code, paste fills
 * all, auto-submit at 6 — stretched invisibly over a row of six visual cells
 * (48×56, radius-md, gap 12). Cells are aria-hidden presentation driven by
 * the input's value/focus; the active cell re-expresses focus (accent border
 * + shadow-focus) because the native outline is hidden with the input.
 * Filled cells: accent border + primary-ink dot; empty: 16%-ink border +
 * 52%-ink dot; error: sentiment border on every cell + role=alert helper.
 */
export function OtpField({ value, onChange, onComplete, disabled, error }: OtpFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const invalid = error !== undefined;

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length === OTP_LENGTH && digits !== value) {
      onComplete?.(digits);
    }
  }

  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <div className="flex flex-col gap-lab-8">
      {/* Clicks anywhere on the row land on the overlay input naturally —
          it stretches across the whole row — so no click handler is needed
          on the presentational wrapper. */}
      <div className="relative flex justify-center gap-lab-12">
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const filled = value[index] !== undefined;
          const isActive = focused && index === activeIndex && !disabled;
          const borderClass = invalid
            ? "border-error"
            : isActive || filled
              ? "border-accent"
              : "border-border-strong";
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional by definition.
              key={index}
              aria-hidden="true"
              className={`flex h-otp-h w-otp-w items-center justify-center rounded-md border bg-surface transition-controls ${borderClass} ${
                isActive ? "shadow-focus" : ""
              } ${disabled ? "opacity-disabled" : ""}`}
            >
              {/* Masked cells (Figma 1563:7321): filled = primary-ink dot,
                  empty = 32%-ink dot — fill state is border + dot strength. */}
              <span
                className={`block size-lab-8 rounded-pill ${filled ? "bg-label-p" : "bg-label-q"}`}
              />
            </div>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          value={value}
          disabled={disabled}
          aria-label={`Код подтверждения, ${OTP_LENGTH} цифр`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(event) => {
            event.preventDefault();
            handleChange(event.clipboardData.getData("text"));
          }}
          className="auth-overlay-input"
        />
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="text-center text-caption text-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
