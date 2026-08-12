import type { UserId } from "@labpics/domain";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "./client";
import { auditEvents, outbox, sessionRefreshCredentials, sessions, users } from "./schema";

const IDLE_TTL_MS = 15 * 60 * 1000;
const ABSOLUTE_TTL_MS = 60 * 60 * 1000;

export type RotationResult =
  | { readonly kind: "rotated"; readonly refreshToken: string }
  | { readonly kind: "replay"; readonly familyId: string }
  | { readonly kind: "invalid" };

export class PostgresSessionSecurityAdapter {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createFixture(subjectId: UserId, now: Date) {
    await this.db
      .insert(users)
      .values({
        id: subjectId,
        name: "Session subject",
        email: `${subjectId}@example.com`,
        emailVerified: true,
      })
      .onConflictDoNothing();
    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(sessions).values({
        id: sessionId,
        userId: subjectId,
        token: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + IDLE_TTL_MS),
        absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_TTL_MS),
      });
      await tx.insert(sessionRefreshCredentials).values({
        id: crypto.randomUUID(),
        sessionId,
        familyId,
        digest: digest(refreshToken),
        expiresAt: new Date(now.getTime() + ABSOLUTE_TTL_MS),
        createdAt: now,
      });
    });
    return { subjectId, sessionId, familyId, refreshToken };
  }

  async rotate(refreshToken: string, now: Date): Promise<RotationResult> {
    return this.db.transaction(async (tx) => {
      const tokenDigest = digest(refreshToken);
      const rows = await tx
        .select()
        .from(sessionRefreshCredentials)
        .where(eq(sessionRefreshCredentials.digest, tokenDigest))
        .limit(1);
      const credential = rows[0];
      if (credential === undefined) return { kind: "invalid" };
      const claimed = await tx
        .update(sessionRefreshCredentials)
        .set({ usedAt: now })
        .where(
          and(
            eq(sessionRefreshCredentials.id, credential.id),
            isNull(sessionRefreshCredentials.usedAt),
            gt(sessionRefreshCredentials.expiresAt, now),
          ),
        )
        .returning({ id: sessionRefreshCredentials.id });
      if (claimed.length === 0) {
        await this.revokeFamilyIn(tx, credential.familyId, now);
        return { kind: "replay", familyId: credential.familyId };
      }
      const next = crypto.randomUUID();
      await tx.insert(sessionRefreshCredentials).values({
        id: crypto.randomUUID(),
        sessionId: credential.sessionId,
        familyId: credential.familyId,
        digest: digest(next),
        expiresAt: credential.expiresAt,
        createdAt: now,
      });
      return { kind: "rotated", refreshToken: next };
    });
  }

  async resolve(refreshToken: string, now: Date) {
    const rows = await this.db
      .select({ session: sessions, deactivatedAt: users.deactivatedAt })
      .from(sessionRefreshCredentials)
      .innerJoin(sessions, eq(sessionRefreshCredentials.sessionId, sessions.id))
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessionRefreshCredentials.digest, digest(refreshToken)))
      .limit(1);
    const row = rows[0]?.session;
    if (row === undefined) return { kind: "invalid" } as const;
    if (rows[0]?.deactivatedAt !== null) return { kind: "revoked" } as const;
    if (row.revokedAt !== null) return { kind: "revoked" } as const;
    if (row.expiresAt <= now || (row.absoluteExpiresAt !== null && row.absoluteExpiresAt <= now)) {
      return { kind: "expired" } as const;
    }
    return { kind: "active", sessionId: row.id } as const;
  }

  async touch(sessionId: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt: now, expiresAt: new Date(now.getTime() + IDLE_TTL_MS) })
      .where(and(eq(sessions.id, sessionId), gt(sessions.absoluteExpiresAt, now)));
  }

  async revokeOne(sessionId: string, now: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
  }

  async logoutAll(
    subjectId: UserId,
    now: Date,
    reason: "logout_all" | "password_change",
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.userId, subjectId));
      await this.record(tx, subjectId, `identity.sessions_revoked.${reason}`, now);
    });
  }

  async deactivate(subjectId: UserId, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ deactivatedAt: now }).where(eq(users.id, subjectId));
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.userId, subjectId));
      await this.record(tx, subjectId, "identity.subject_deactivated", now);
    });
  }

  async list(subjectId: UserId, now: Date) {
    return this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, subjectId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          gt(sessions.absoluteExpiresAt, now),
        ),
      );
  }

  async activeFamilyCount(familyId: string): Promise<number> {
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessionRefreshCredentials)
      .innerJoin(sessions, eq(sessionRefreshCredentials.sessionId, sessions.id))
      .where(and(eq(sessionRefreshCredentials.familyId, familyId), isNull(sessions.revokedAt)));
    return rows.length;
  }

  async securityEventCount(familyId: string): Promise<number> {
    const rows = await this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(eq(outbox.type, `identity.refresh_replay.${familyId}`));
    return rows.length;
  }

  async protocolSignalCount(subjectId: UserId): Promise<number> {
    const rows = await this.db
      .select({ id: outbox.id })
      .from(outbox)
      .where(eq(outbox.type, `identity.subject_deactivated.${subjectId}`));
    return rows.length;
  }

  private async revokeFamilyIn(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    familyId: string,
    now: Date,
  ) {
    const family = await tx
      .select({ sessionId: sessionRefreshCredentials.sessionId })
      .from(sessionRefreshCredentials)
      .where(eq(sessionRefreshCredentials.familyId, familyId));
    for (const credential of family) {
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, credential.sessionId));
    }
    await tx.insert(auditEvents).values({
      actorId: "session-security",
      action: "identity.refresh_replay",
      targetType: "refresh_family",
      targetId: familyId,
      occurredAt: now,
      hash: crypto.randomUUID(),
    });
    await tx
      .insert(outbox)
      .values({ type: `identity.refresh_replay.${familyId}`, payload: { familyId } });
  }

  private async record(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    subjectId: UserId,
    action: string,
    now: Date,
  ) {
    await tx.insert(auditEvents).values({
      actorId: subjectId,
      action,
      targetType: "subject",
      targetId: subjectId,
      occurredAt: now,
      hash: crypto.randomUUID(),
    });
    await tx.insert(outbox).values({ type: `${action}.${subjectId}`, payload: { subjectId } });
  }
}

function digest(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}
