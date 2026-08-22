/**
 * Email-OTP login contracts (CH08).
 *
 * Enumeration resistance (INV-12): the public result of requesting an OTP is
 * structurally identical for unknown, deactivated, and existing accounts.
 * This is encoded in the types below — `RequestOtpResult` has NO
 * account-not-found / account-state variant, so a leak cannot compile.
 *
 * Session ownership (INV-21): exactly one component owns session state for
 * email-OTP. See `OtpSessionOwner` below.
 */
import type { Email } from "../value-objects/email";
import type { OtpChallengeId, UserId } from "../value-objects/ids";
import type { SessionView } from "./contract";

/** Caller network identity used only for abuse budgets and audit, never for decisions. */
export interface SourceIdentity {
  readonly ip: string;
  readonly userAgent?: string;
}

export interface RequestOtpCommand {
  readonly email: Email;
  readonly source: SourceIdentity;
  /** Optional post-login destination; validated against an allowlist by the caller. */
  readonly continueTo?: string;
}

/**
 * Public acceptance payload. Every field is safe to expose regardless of
 * account existence: `challengeId` is issued for unknown accounts too, and
 * `retryAt`/`expiresAt` are policy constants, not account-derived data.
 */
export interface RequestOtpAccepted {
  readonly challengeId: OtpChallengeId;
  /** Earliest moment the same caller may request another OTP. */
  readonly retryAt: Date;
  /** Moment the issued challenge stops being redeemable. */
  readonly expiresAt: Date;
}

/**
 * INV-12: the ONLY variants are uniform acceptance, rate limiting, and
 * fail-closed storage failure. There is deliberately no variant that reveals
 * whether the email maps to an account or what state that account is in.
 */
export type RequestOtpResult =
  | { readonly kind: "accepted"; readonly value: RequestOtpAccepted }
  | { readonly kind: "rate_limited"; readonly retryAt: Date }
  | { readonly kind: "storage_unavailable" };

export interface RedeemOtpCommand {
  readonly challengeId: OtpChallengeId;
  readonly code: string;
  readonly source: SourceIdentity;
}

/**
 * Redeem failures. `invalid_code` reports the remaining budget of the
 * presented challenge only — the count never encodes account existence or
 * state (unknown-account challenges carry the same budget). `replayed`
 * covers both replays and lost single-winner races (INV-11); the two are
 * indistinguishable on purpose. `storage_unavailable` is fail-closed: on
 * storage failure the redeem is rejected, never granted.
 */
export type RedeemOtpFailure =
  | { readonly kind: "expired" }
  | { readonly kind: "invalid_code"; readonly remainingAttempts: number }
  | { readonly kind: "replayed" }
  | { readonly kind: "rate_limited"; readonly retryAt: Date }
  | { readonly kind: "storage_unavailable" };

export interface OtpSessionEstablished {
  readonly session: SessionView;
  readonly subject: EmployeeSubjectEnvelopeV1;
}

export type RedeemOtpResult =
  | { readonly kind: "session_established"; readonly value: OtpSessionEstablished }
  | { readonly kind: "rejected"; readonly error: RedeemOtpFailure };

/**
 * Versioned session subject envelope (INV-21). Session creation references
 * this envelope, never a bare user id, so the subject schema can evolve by
 * adding V2 without reinterpreting stored sessions.
 */
export interface EmployeeSubjectEnvelopeV1 {
  readonly schema_version: 1;
  readonly kind: "employee";
  readonly accountId: UserId;
  readonly email: Email;
}

/**
 * The single owner of session state for email-OTP (INV-21).
 *
 * Decision: the domain session created via the Better Auth adapter path
 * (AuthPort in apps/api) is the ONLY session-state owner. No sidecar store,
 * cookie, or cache may create, resolve, rotate, or revoke email-OTP sessions
 * independently — every mutation of session state goes through exactly one
 * implementation of this interface.
 */
export interface OtpSessionOwner {
  create(subject: EmployeeSubjectEnvelopeV1, authenticatedAt: Date): Promise<SessionView>;
  resolve(credential: string): Promise<OtpSessionEstablished | null>;
  rotate(sessionId: string): Promise<SessionView>;
  revoke(sessionId: string): Promise<void>;
}

export interface OtpUseCases {
  requestOtp(command: RequestOtpCommand): Promise<RequestOtpResult>;
  redeemOtp(command: RedeemOtpCommand): Promise<RedeemOtpResult>;
}
