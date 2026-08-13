import { type Email, type RateLimitPort, type UserId, userId } from "@labpics/domain";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import { auditEvents, bootstrapTokens, outbox, platformAdministrators, users } from "./schema";

export interface CreateBootstrapTokenCommand {
  readonly email: Email;
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export type ClaimBootstrapResult =
  | { readonly kind: "created"; readonly userId: UserId }
  | { readonly kind: "rejected" };

export class FirstAdminBootstrap {
  private readonly db: Database;
  private readonly rateLimit: RateLimitPort | undefined;

  constructor(db: Database, rateLimit?: RateLimitPort) {
    this.db = db;
    this.rateLimit = rateLimit;
  }

  async createToken(command: CreateBootstrapTokenCommand): Promise<void> {
    await this.db.insert(bootstrapTokens).values({
      id: crypto.randomUUID(),
      tokenDigest: digest(command.rawToken),
      email: command.email.toString(),
      expiresAt: command.expiresAt,
    });
  }

  async claim(input: {
    readonly rawToken: string;
    readonly verifiedEmail: Email;
    readonly now: Date;
  }): Promise<ClaimBootstrapResult> {
    const decision = await this.rateLimit?.consume({
      action: "bootstrap_claim",
      key: input.verifiedEmail.toString(),
      source: "bootstrap-control",
    });
    if (decision?.kind === "limited") return { kind: "rejected" };
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(814245021)`);
      const [identityCount, adminCount] = await Promise.all([
        tx.select({ count: sql<number>`count(*)::int` }).from(users),
        tx.select({ count: sql<number>`count(*)::int` }).from(platformAdministrators),
      ]);
      if ((identityCount[0]?.count ?? 0) !== 0 || (adminCount[0]?.count ?? 0) !== 0) {
        return { kind: "rejected" };
      }
      const tokens = await tx
        .update(bootstrapTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(bootstrapTokens.tokenDigest, digest(input.rawToken)),
            eq(bootstrapTokens.email, input.verifiedEmail.toString()),
            isNull(bootstrapTokens.consumedAt),
            gt(bootstrapTokens.expiresAt, input.now),
          ),
        )
        .returning({ id: bootstrapTokens.id });
      if (tokens.length !== 1) return { kind: "rejected" };
      const subjectId = userId(crypto.randomUUID());
      await tx.insert(users).values({
        id: subjectId,
        name: "First administrator",
        email: input.verifiedEmail.toString(),
        emailVerified: true,
      });
      await tx.insert(platformAdministrators).values({ singleton: true, userId: subjectId });
      await tx.insert(auditEvents).values({
        actorId: subjectId,
        action: "identity.first_admin_bootstrapped",
        targetType: "subject",
        targetId: subjectId,
        occurredAt: input.now,
        hash: crypto.randomUUID(),
      });
      await tx.insert(outbox).values({
        type: "identity.first_admin_bootstrapped",
        payload: {
          idempotencyKey: `identity.first_admin_bootstrapped:${subjectId}`,
          type: "identity.first_admin_bootstrapped",
          payload: { subjectId },
          occurredAt: input.now.toISOString(),
        },
      });
      return { kind: "created", userId: subjectId };
    });
  }
}

function digest(rawToken: string): string {
  return new Bun.CryptoHasher("sha256").update(rawToken).digest("hex");
}
