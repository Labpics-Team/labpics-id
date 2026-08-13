import type { IdentityAction, RateLimitDecision, RateLimitPort } from "@labpics/domain";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { auditEvents, authRateLimits, outbox } from "./schema";

const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const SOURCE_BUDGET = 3;
const ACCOUNT_BUDGET = 6;

export class PostgresRateLimitPort implements RateLimitPort {
  private readonly db: Database;
  private readonly now: () => Date;
  private readonly availabilityCheck: () => Promise<void>;

  constructor(
    db: Database,
    now: () => Date = () => new Date(),
    availabilityCheck: () => Promise<void> = async () => undefined,
  ) {
    this.db = db;
    this.now = now;
    this.availabilityCheck = availabilityCheck;
  }

  async consume(attempt: {
    readonly action: IdentityAction;
    readonly key: string;
    readonly source?: string;
  }): Promise<RateLimitDecision> {
    const now = this.now();
    const accountDigest = digest(`${attempt.action}:account:${attempt.key}`);
    const sourceDigest = digest(`${attempt.action}:source:${attempt.source ?? "unknown"}`);
    try {
      await this.availabilityCheck();
      return await this.db.transaction(async (tx) => {
        const account = await consumeDimension(
          tx,
          attempt.action,
          accountDigest,
          now,
          ACCOUNT_BUDGET,
        );
        const source = await consumeDimension(tx, attempt.action, sourceDigest, now, SOURCE_BUDGET);
        const retryAt = account ?? source;
        if (retryAt === null) return { kind: "allowed" };
        await tx.insert(auditEvents).values({
          actorId: accountDigest,
          action: "identity.auth_lockout",
          targetType: "rate_limit",
          targetId: accountDigest,
          occurredAt: now,
          hash: crypto.randomUUID(),
        });
        await tx.insert(outbox).values({
          type: "identity.auth_lockout",
          payload: {
            idempotencyKey: `identity.auth_lockout:${accountDigest}:${now.toISOString()}`,
            type: "identity.auth_lockout",
            payload: { action: attempt.action, accountDigest, sourceDigest },
            occurredAt: now.toISOString(),
          },
        });
        return { kind: "limited", retryAt };
      });
    } catch {
      return { kind: "limited", retryAt: now };
    }
  }
}

async function consumeDimension(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  action: IdentityAction,
  keyDigest: string,
  now: Date,
  budget: number,
): Promise<Date | null> {
  const current = (
    await tx
      .select()
      .from(authRateLimits)
      .where(and(eq(authRateLimits.action, action), eq(authRateLimits.keyDigest, keyDigest)))
      .for("update")
      .limit(1)
  )[0];
  if (
    current?.lockedUntil !== null &&
    current?.lockedUntil !== undefined &&
    current.lockedUntil > now
  ) {
    return current.lockedUntil;
  }
  const reset =
    current === undefined || now.getTime() - current.windowStartedAt.getTime() >= WINDOW_MS;
  const recovering =
    current?.lockedUntil !== null &&
    current?.lockedUntil !== undefined &&
    current.lockedUntil <= now;
  const attempts = reset || recovering ? 1 : current.attempts + 1;
  const lockedUntil = attempts > budget ? new Date(now.getTime() + LOCK_MS) : null;
  await tx
    .insert(authRateLimits)
    .values({
      id: current?.id ?? crypto.randomUUID(),
      action,
      keyDigest,
      attempts,
      windowStartedAt: reset || recovering ? now : current.windowStartedAt,
      lockedUntil,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [authRateLimits.action, authRateLimits.keyDigest],
      set: {
        attempts,
        windowStartedAt: reset || recovering ? now : current?.windowStartedAt,
        lockedUntil,
        updatedAt: now,
      },
    });
  return lockedUntil;
}

function digest(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
