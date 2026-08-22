import type {
  ConsumeOtpChallengeInput,
  ConsumeOtpChallengeOutcome,
  CreateOtpChallengeInput,
  OtpChallengeRecord,
  OtpChallengeStore,
  TransactionContext,
} from "@labpics/domain";
import { Email } from "@labpics/domain";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { otpChallenges } from "./schema";
import type { PostgresTransactionContext } from "./unit-of-work";

/**
 * PostgreSQL implementation of the domain OtpChallengeStore (INV-09/11/13).
 *
 * - The raw opaque challenge id is digested (sha256) before touching storage;
 *   only the digest is persisted, and the consumed record echoes the caller's
 *   raw id back — the row can never reveal it (INV-09).
 * - account_id stays in the schema as a nullable column but this store always
 *   writes NULL: the domain port carries no account binding, and account
 *   resolution at redeem time is the use-case's job. The column is kept so a
 *   later revision can bind without a migration.
 * - INV-11: the winning path is ONE atomic UPDATE whose predicate carries every
 *   winning condition (id digest, purpose, not consumed, not expired, digest
 *   match, attempts left). Exactly one concurrent statement can match the row.
 * - Attempt budget exhaustion maps to `not_found` per the port contract: a
 *   dead challenge is indistinguishable from an unknown one.
 */
export class PostgresOtpChallengeStore implements OtpChallengeStore {
  async create(
    context: TransactionContext,
    input: CreateOtpChallengeInput,
  ): Promise<OtpChallengeRecord> {
    await transactionOf(context)
      .insert(otpChallenges)
      .values({
        challengeIdDigest: digestChallengeId(input.id),
        purpose: input.purpose,
        email: input.email.value,
        accountId: null,
        codeVerifier: input.codeDigest,
        attemptsRemaining: input.maxAttempts,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
        sourceDigest: null,
      });
    return {
      id: input.id,
      email: input.email,
      purpose: input.purpose,
      codeDigest: input.codeDigest,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      remainingAttempts: input.maxAttempts,
    };
  }

  async consume(
    context: TransactionContext,
    input: ConsumeOtpChallengeInput,
  ): Promise<ConsumeOtpChallengeOutcome> {
    const tx = transactionOf(context);
    const challengeIdDigest = digestChallengeId(input.id);
    // Winning path: one atomic UPDATE carrying the full predicate (INV-11).
    const winner = await tx
      .update(otpChallenges)
      .set({ consumedAt: input.now })
      .where(
        and(
          eq(otpChallenges.challengeIdDigest, challengeIdDigest),
          eq(otpChallenges.purpose, input.purpose),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, input.now),
          eq(otpChallenges.codeVerifier, input.codeDigest),
          gt(otpChallenges.attemptsRemaining, 0),
        ),
      )
      .returning({
        email: otpChallenges.email,
        codeVerifier: otpChallenges.codeVerifier,
        createdAt: otpChallenges.createdAt,
        expiresAt: otpChallenges.expiresAt,
        attemptsRemaining: otpChallenges.attemptsRemaining,
      });
    const won = winner[0];
    if (won !== undefined) {
      return {
        kind: "consumed",
        challenge: {
          id: input.id,
          email: Email.from(won.email),
          purpose: input.purpose,
          codeDigest: won.codeVerifier,
          createdAt: won.createdAt,
          expiresAt: won.expiresAt,
          remainingAttempts: won.attemptsRemaining,
        },
      };
    }
    // Losing path: atomically charge the budget of THIS challenge only for a
    // live challenge with a wrong digest (INV-13), then classify the failure.
    const decremented = await tx
      .update(otpChallenges)
      .set({ attemptsRemaining: sql`${otpChallenges.attemptsRemaining} - 1` })
      .where(
        and(
          eq(otpChallenges.challengeIdDigest, challengeIdDigest),
          eq(otpChallenges.purpose, input.purpose),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, input.now),
          ne(otpChallenges.codeVerifier, input.codeDigest),
          gt(otpChallenges.attemptsRemaining, 0),
        ),
      )
      .returning({ attemptsRemaining: otpChallenges.attemptsRemaining });
    const wrongCode = decremented[0];
    if (wrongCode !== undefined) {
      return { kind: "invalid_code", remainingAttempts: wrongCode.attemptsRemaining };
    }
    const row = (
      await tx
        .select({
          consumedAt: otpChallenges.consumedAt,
          expiresAt: otpChallenges.expiresAt,
        })
        .from(otpChallenges)
        .where(
          and(
            eq(otpChallenges.challengeIdDigest, challengeIdDigest),
            eq(otpChallenges.purpose, input.purpose),
          ),
        )
        .limit(1)
    )[0];
    // Unknown id, purpose mismatch, or exhausted budget: all not_found —
    // a dead challenge must be indistinguishable from an unknown one.
    if (row === undefined) return { kind: "not_found" };
    if (row.consumedAt !== null) return { kind: "already_consumed" };
    if (row.expiresAt <= input.now) return { kind: "expired" };
    return { kind: "not_found" };
  }
}

class OtpPersistenceError extends Error {
  override readonly name = "OtpPersistenceError";
}

function transactionOf(context: TransactionContext): PostgresTransactionContext["transaction"] {
  if (!("transaction" in context)) throw new OtpPersistenceError("Postgres transaction required");
  return context.transaction as PostgresTransactionContext["transaction"];
}

function digestChallengeId(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}
