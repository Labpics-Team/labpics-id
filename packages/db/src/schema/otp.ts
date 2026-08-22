import { isNull } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * OTP login challenges (INV-09/10/11/13).
 *
 * - The raw public challenge id is high-entropy and NOT stored; only its
 *   SHA-256 digest is (same pattern as auth_rate_limits.key_digest).
 * - The raw OTP code is NEVER stored (INV-09): code_verifier holds a
 *   challenge-scoped deterministic digest so consume can match it inside a
 *   single atomic UPDATE predicate. Offline brute force of the small code
 *   space is mitigated by attempts_remaining and expires_at, not by the hash.
 * - account_id is nullable BY DESIGN (enumeration resistance): a challenge
 *   row is created for unknown accounts too, so request behavior and timing
 *   are uniform; account binding happens at creation when the account exists.
 * - No supersede mechanics (INV-10): a new request never revokes a prior
 *   unexpired challenge.
 */
export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeIdDigest: text("challenge_id_digest").notNull(),
    purpose: text("purpose").notNull(),
    // Plain email matches the existing convention (users.email is plain text).
    email: text("email").notNull(),
    accountId: text("account_id").references(() => users.id, { onDelete: "cascade" }),
    codeVerifier: text("code_verifier").notNull(),
    attemptsRemaining: integer("attempts_remaining").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    // Nullable: the domain port carries no source binding yet; a later
    // revision can populate it without a migration (same as account_id).
    sourceDigest: text("source_digest"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("otp_challenges_challenge_id_digest_unique").on(table.challengeIdDigest),
    index("otp_challenges_open_expires_idx").on(table.expiresAt).where(isNull(table.consumedAt)),
  ],
);
