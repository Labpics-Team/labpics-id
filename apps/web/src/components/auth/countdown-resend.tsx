"use client";

import { useEffect, useState } from "react";

export const RESEND_COOLDOWN_SECONDS = 60;

/*
 * Resend control with cooldown (DESIGN-BRIEF A4): a real button, disabled
 * while cooling, countdown announced via aria-live=polite on a separate
 * element (announcing the button label itself would re-read every second
 * while focused). The 1s tick is a state change, not an animation loop —
 * reduced motion does not apply to time itself.
 */
export function CountdownResend({
  onResend,
  disabled,
}: {
  onResend: () => void;
  disabled?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const cooling = secondsLeft > 0;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function handleResend() {
    onResend();
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <p className="text-center text-caption text-label-t">
      <span aria-live="polite">
        {cooling ? `Отправить код повторно можно через ${secondsLeft} с` : ""}
      </span>
      {!cooling && (
        <button
          type="button"
          onClick={handleResend}
          disabled={disabled}
          className="inline-flex min-h-touch items-center justify-center rounded-sm px-lab-8 text-caption text-accent-text transition-controls hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-press disabled:cursor-not-allowed disabled:opacity-disabled"
        >
          Отправить код повторно
        </button>
      )}
    </p>
  );
}
