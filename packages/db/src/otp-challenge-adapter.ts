import type { TransactionContext } from "@labpics/domain";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { otpChallenges } from "./schema";
import type { PostgresTransactionContext } from "./unit-of-work";

/**
 * OTP challenge adapter (INV-09/10/11).
 *
 * Input types are local to packages/db for now; alignment with the domain
 * OtpChallengeStore port happens during REQ-01 assembly.
 *
 * INV-11 (single winner): consume is ONE atomic UPDATE whose predicate holds
 * every winning condition (not consumed, not expired, verifier match,
 * attempts left). Under concurrency exactly one statement matches the row;
 * all others observe consumed_at set and classify as replayed.
 */
export interface CreateOtpChallenge {
  readonly challengeIdDigest: string;
  readonly purpose: string;
  readonly email: string;
  readonly accountId: string | null;
  readonly codeVerifier: string;
  readonly expiresAt: Date;
  readonly sourceDigest: string;
  readonly attempts?: number;
}

export interface ConsumeOtpChallenge {
  readonly challengeIdDigest: string;
  readonly codeVerifier: string;
  readonly now: Date;
}

export type ConsumeOtpResult =
  | { readonly kind: "consumed"; readonly accountId: string | null; readonly email: string }
  | { readonly kind: "expired" }
  | { readonly kind: "invalid_code"; readonly attemptsRemaining: number }
  | { readonly kind: "replayed" }
  | { readonly kind: "not_found" };

export class PostgresOtpChallengeAdapter {
  async createChallenge(context: TransactionContext, challenge: CreateOtpChallenge): Promise<void> {
    await transactionOf(context)
      .insert(otpChallenges)
      .values({
        challengeIdDigest: challenge.challengeIdDigest,
        purpose: challenge.purpose,
        email: challenge.email,
        accountId: challenge.accountId,
        codeVerifier: challenge.codeVerifier,
        attemptsRemaining: challenge.attempts ?? 5,
        expiresAt: challenge.expiresAt,
        sourceDigest: challenge.sourceDigest,
      });
  }

  async consumeChallenge(
    context: TransactionContext,
    attempt: ConsumeOtpChallenge,
  ): Promise<ConsumeOtpResult> {
    const tx = transactionOf(context);
    // Winning path: one atomic UPDATE carrying the full predicate (INV-11).
    const winner = await tx
      .update(otpChallenges)
      .set({ consumedAt: attempt.now })
      .where(
        and(
          eq(otpChallenges.challengeIdDigest, attempt.challengeIdDigest),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, attempt.now),
          eq(otpChallenges.codeVerifier, attempt.codeVerifier),
          gt(otpChallenges.attemptsRemaining, 0),
        ),
      )
      .returning({ accountId: otpChallenges.accountId, email: otpChallenges.email });
    const won = winner[0];
    if (won !== undefined) {
      return { kind: "consumed", accountId: won.accountId, email: won.email };
    }
    // Losing path: decrement the attempt budget atomically for a live
    // challenge with a wrong verifier, then classify why the win failed.
    const decremented = await tx
      .update(otpChallenges)
      .set({ attemptsRemaining: sql`${otpChallenges.attemptsRemaining} - 1` })
      .where(
        and(
          eq(otpChallenges.challengeIdDigest, attempt.challengeIdDigest),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, attempt.now),
          ne(otpChallenges.codeVerifier, attempt.codeVerifier),
          gt(otpChallenges.attemptsRemaining, 0),
        ),
      )
      .returning({ attemptsRemaining: otpChallenges.attemptsRemaining });
    const wrongCode = decremented[0];
    if (wrongCode !== undefined) {
      return { kind: "invalid_code", attemptsRemaining: wrongCode.attemptsRemaining };
    }
    const row = (
      await tx
        .select({
          consumedAt: otpChallenges.consumedAt,
          expiresAt: otpChallenges.expiresAt,
          attemptsRemaining: otpChallenges.attemptsRemaining,
        })
        .from(otpChallenges)
        .where(eq(otpChallenges.challengeIdDigest, attempt.challengeIdDigest))
        .limit(1)
    )[0];
    if (row === undefined) return { kind: "not_found" };
    if (row.consumedAt !== null) return { kind: "replayed" };
    if (row.expiresAt <= attempt.now) return { kind: "expired" };
    // Live, unconsumed, unexpired, yet neither UPDATE matched: the attempt
    // budget is exhausted — even a correct code must fail here.
    return { kind: "invalid_code", attemptsRemaining: row.attemptsRemaining };
  }
}

class OtpPersistenceError extends Error {
  override readonly name = "OtpPersistenceError";
}

function transactionOf(context: TransactionContext): PostgresTransactionContext["transaction"] {
  if (!("transaction" in context)) throw new OtpPersistenceError("Postgres transaction required");
  return context.transaction as PostgresTransactionContext["transaction"];
}
