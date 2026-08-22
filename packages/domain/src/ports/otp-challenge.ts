/**
 * OTP challenge store port (secondary port, implemented by infrastructure).
 *
 * INV-11: `consume` is atomic single-winner. For a given challenge id, at most
 * one concurrent consume attempt with the correct code digest may observe
 * `kind: "consumed"`; every other concurrent or later attempt observes
 * `kind: "already_consumed"`. Implementations must enforce this inside the
 * caller's transaction (row lock / conditional update), never in memory.
 *
 * Challenges are independent (INV-13): creating a new challenge must not
 * revoke or expire prior unexpired challenges, and a failed attempt against
 * one challenge must not consume the attempt budget of another.
 *
 * Storage failure is fail-closed: implementations reject the operation; they
 * never report a challenge as consumed or valid on a storage error.
 */
import type { Email } from "../value-objects/email";
import type { OtpChallengeId } from "../value-objects/ids";
import type { TransactionContext } from "./unit-of-work";

/** The only OTP purpose in CH08; redeem must verify purpose binding. */
export type OtpPurpose = "email_otp_login";

export interface OtpChallengeRecord {
  readonly id: OtpChallengeId;
  readonly email: Email;
  readonly purpose: OtpPurpose;
  /** Digest of the code; the raw code is never stored (INV-09). */
  readonly codeDigest: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Wrong-code budget remaining on THIS challenge only. */
  readonly remainingAttempts: number;
}

export interface CreateOtpChallengeInput {
  readonly id: OtpChallengeId;
  readonly email: Email;
  readonly purpose: OtpPurpose;
  readonly codeDigest: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly maxAttempts: number;
}

export interface ConsumeOtpChallengeInput {
  readonly id: OtpChallengeId;
  readonly purpose: OtpPurpose;
  readonly codeDigest: string;
  readonly now: Date;
}

export type ConsumeOtpChallengeOutcome =
  /** This caller is the single winner; the challenge is now spent. */
  | { readonly kind: "consumed"; readonly challenge: OtpChallengeRecord }
  /** Wrong code; budget decremented on this challenge only. */
  | { readonly kind: "invalid_code"; readonly remainingAttempts: number }
  | { readonly kind: "expired" }
  /** Challenge was already spent (replay or a concurrent winner). */
  | { readonly kind: "already_consumed" }
  /** Unknown id, purpose mismatch, or attempt budget exhausted. */
  | { readonly kind: "not_found" };

export interface OtpChallengeStore {
  create(context: TransactionContext, input: CreateOtpChallengeInput): Promise<OtpChallengeRecord>;
  consume(
    context: TransactionContext,
    input: ConsumeOtpChallengeInput,
  ): Promise<ConsumeOtpChallengeOutcome>;
}

/** Generates and digests OTP codes; the raw code exists in memory only (INV-09). */
export interface OtpCodePort {
  generate(): Promise<{ readonly code: string; readonly digest: string }>;
  digest(code: string): Promise<string>;
}
