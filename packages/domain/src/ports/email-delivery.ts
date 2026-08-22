/**
 * Email delivery port for OTP messages (secondary port, implemented by
 * infrastructure adapters such as the Resend HTTP adapter).
 *
 * Idempotency: `idempotencyKey` is forwarded to the provider so retries of the
 * same logical send never produce a second email; a replayed send resolves as
 * `delivered` with the SAME `providerMessageId`. `duplicate` is true only when
 * the implementation can positively identify the replay (best-effort — some
 * providers replay the original response without a marker).
 *
 * INV-09: the OTP `code` passes through in-memory only. Implementations MUST
 * NOT log, persist, or embed the code in any error, log line, result object,
 * or telemetry — the only place the code may appear is the outgoing message
 * body sent to the provider.
 */
import type { Email } from "../value-objects/email";

export interface OtpEmailMessage {
  /** Provider-level dedup key: retries with this key must not re-send. */
  readonly idempotencyKey: string;
  readonly to: Email;
  readonly purpose: "email_otp_login";
  /** One-time code; in-memory only per INV-09 (see module doc). */
  readonly code: string;
  readonly expiresAt: Date;
}

export type DeliveryResult =
  | {
      readonly kind: "delivered";
      readonly providerMessageId: string;
      /** True when the provider replayed a previous send for the same idempotency key. */
      readonly duplicate: boolean;
    }
  | {
      readonly kind: "retryable";
      readonly reason: "timeout" | "rate_limited" | "server_error";
      readonly retryAt?: Date;
    }
  | {
      readonly kind: "terminal";
      readonly reason: "invalid_recipient" | "payload_mismatch" | "rejected";
    };

export interface EmailDeliveryPort {
  send(message: OtpEmailMessage): Promise<DeliveryResult>;
}
