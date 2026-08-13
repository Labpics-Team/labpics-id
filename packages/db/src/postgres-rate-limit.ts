import type { IdentityAction, RateLimitDecision, RateLimitPort } from "@labpics/domain";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { authRateLimits } from "./schema";

const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const ATTEMPT_BUDGET = 3;

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
  }): Promise<RateLimitDecision> {
    const now = this.now();
    const keyDigest = digest(attempt.key);
    try {
      await this.availabilityCheck();
      return this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(authRateLimits)
          .where(
            and(eq(authRateLimits.action, attempt.action), eq(authRateLimits.keyDigest, keyDigest)),
          )
          .for("update")
          .limit(1);
        const current = rows[0];
        if (
          current?.lockedUntil !== null &&
          current?.lockedUntil !== undefined &&
          current.lockedUntil > now
        ) {
          return { kind: "limited", retryAt: current.lockedUntil };
        }
        const reset =
          current === undefined || now.getTime() - current.windowStartedAt.getTime() >= WINDOW_MS;
        const attempts = reset ? 1 : current.attempts + 1;
        const lockedUntil = attempts > ATTEMPT_BUDGET ? new Date(now.getTime() + LOCK_MS) : null;
        await tx
          .insert(authRateLimits)
          .values({
            id: current?.id ?? crypto.randomUUID(),
            action: attempt.action,
            keyDigest,
            attempts,
            windowStartedAt: reset ? now : current.windowStartedAt,
            lockedUntil,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [authRateLimits.action, authRateLimits.keyDigest],
            set: {
              attempts,
              windowStartedAt: reset ? now : current?.windowStartedAt,
              lockedUntil,
              updatedAt: now,
            },
          });
        return lockedUntil === null
          ? { kind: "allowed" }
          : { kind: "limited", retryAt: lockedUntil };
      });
    } catch {
      return { kind: "limited", retryAt: now };
    }
  }
}

function digest(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
