import type {
  ClientRegistryPort,
  ConsentPort,
  ProtocolArtifactModel,
  ProtocolArtifactPort,
  ProtocolArtifactPutOptions,
  ProtocolArtifactRecord,
  ProtocolClientRecord,
  ProtocolConsentRecord,
  ProtocolSigningKeyRecord,
  SigningKeyPort,
  TransactionContext,
} from "@labpics/domain";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  oauthClientAllowedAudiences,
  oauthClientAllowedGrants,
  oauthClientAllowedScopes,
  oauthClientPostLogoutRedirectUris,
  oauthClientRedirectUris,
  oauthClients,
  oauthConsents,
  protocolArtifacts,
  protocolSigningKeys,
} from "./schema";
import type { PostgresTransactionContext } from "./unit-of-work";

export class PostgresProtocolAdapter
  implements ClientRegistryPort, ConsentPort, SigningKeyPort, ProtocolArtifactPort
{
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getClient(
    clientId: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolClientRecord | null> {
    const db = txOrDb(ctx, this.db);
    const clients = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    const client = clients[0];
    if (!client) return null;

    const [redirectUris, postLogoutRedirectUris, allowedScopes, allowedAudiences, allowedGrants] =
      await Promise.all([
        db
          .select({ uri: oauthClientRedirectUris.uri })
          .from(oauthClientRedirectUris)
          .where(eq(oauthClientRedirectUris.clientId, clientId)),
        db
          .select({ uri: oauthClientPostLogoutRedirectUris.uri })
          .from(oauthClientPostLogoutRedirectUris)
          .where(eq(oauthClientPostLogoutRedirectUris.clientId, clientId)),
        db
          .select({ scope: oauthClientAllowedScopes.scope })
          .from(oauthClientAllowedScopes)
          .where(eq(oauthClientAllowedScopes.clientId, clientId)),
        db
          .select({ audience: oauthClientAllowedAudiences.audience })
          .from(oauthClientAllowedAudiences)
          .where(eq(oauthClientAllowedAudiences.clientId, clientId)),
        db
          .select({ grantType: oauthClientAllowedGrants.grantType })
          .from(oauthClientAllowedGrants)
          .where(eq(oauthClientAllowedGrants.clientId, clientId)),
      ]);

    return {
      clientId: client.clientId,
      clientName: client.clientName,
      subjectType: client.subjectType,
      sectorIdentifier: client.sectorIdentifier,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      isActive: client.isActive,
      redirectUris: redirectUris.map((r) => r.uri),
      postLogoutRedirectUris: postLogoutRedirectUris.map((r) => r.uri),
      allowedScopes: allowedScopes.map((s) => s.scope),
      allowedAudiences: allowedAudiences.map((a) => a.audience),
      allowedGrants: allowedGrants.map((g) => g.grantType),
    };
  }

  async getConsent(
    subjectId: string,
    clientId: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolConsentRecord | null> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .select()
      .from(oauthConsents)
      .where(
        and(
          eq(oauthConsents.subjectId, subjectId),
          eq(oauthConsents.clientId, clientId),
          isNull(oauthConsents.revokedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      subjectId: row.subjectId,
      clientId: row.clientId,
      scopes: row.scopes as string[],
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
    };
  }

  async upsertConsent(
    subjectId: string,
    clientId: string,
    scopes: readonly string[],
    now: Date,
    ctx?: TransactionContext,
  ): Promise<ProtocolConsentRecord> {
    const db = txOrDb(ctx, this.db);
    const id = crypto.randomUUID();

    await db
      .update(oauthConsents)
      .set({ revokedAt: now })
      .where(
        and(
          eq(oauthConsents.subjectId, subjectId),
          eq(oauthConsents.clientId, clientId),
          isNull(oauthConsents.revokedAt),
        ),
      );

    await db.insert(oauthConsents).values({
      id,
      subjectId,
      clientId,
      scopes: [...scopes],
      grantedAt: now,
    });

    return {
      subjectId,
      clientId,
      scopes: [...scopes],
      grantedAt: now,
      revokedAt: null,
    };
  }

  async revokeConsent(
    subjectId: string,
    clientId: string,
    now: Date,
    ctx?: TransactionContext,
  ): Promise<void> {
    const db = txOrDb(ctx, this.db);
    await db
      .update(oauthConsents)
      .set({ revokedAt: now })
      .where(
        and(
          eq(oauthConsents.subjectId, subjectId),
          eq(oauthConsents.clientId, clientId),
          isNull(oauthConsents.revokedAt),
        ),
      );
  }

  async listSigningKeys(ctx?: TransactionContext): Promise<readonly ProtocolSigningKeyRecord[]> {
    const db = txOrDb(ctx, this.db);
    const rows = await db.select().from(protocolSigningKeys);
    return rows.map((row) => ({
      kid: row.kid,
      status: row.status,
      algorithm: row.algorithm,
      publicKeyJwk: row.publicKeyJwk,
      createdAt: row.createdAt,
      retiredAt: row.retiredAt,
    }));
  }

  async getArtifact(
    model: ProtocolArtifactModel,
    id: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .select()
      .from(protocolArtifacts)
      .where(and(eq(protocolArtifacts.model, model), eq(protocolArtifacts.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return artifactRecord(row);
  }

  async putArtifact(
    model: ProtocolArtifactModel,
    id: string,
    payload: Record<string, unknown>,
    options: ProtocolArtifactPutOptions,
    ctx?: TransactionContext,
  ): Promise<void> {
    const db = txOrDb(ctx, this.db);
    await db
      .insert(protocolArtifacts)
      .values({
        model,
        id,
        grantId: options.grantId ?? null,
        payload,
        expiresAt: options.expiresAt ?? null,
        uid: options.uid ?? null,
        userCode: options.userCode ?? null,
      })
      .onConflictDoUpdate({
        target: [protocolArtifacts.model, protocolArtifacts.id],
        set: {
          grantId: options.grantId ?? null,
          payload,
          expiresAt: options.expiresAt ?? null,
          uid: options.uid ?? null,
          userCode: options.userCode ?? null,
        },
      });
  }

  async findArtifactByUid(
    model: ProtocolArtifactModel,
    uid: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .select()
      .from(protocolArtifacts)
      .where(and(eq(protocolArtifacts.model, model), eq(protocolArtifacts.uid, uid)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return artifactRecord(row);
  }

  async findArtifactByUserCode(
    model: ProtocolArtifactModel,
    userCode: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .select()
      .from(protocolArtifacts)
      .where(and(eq(protocolArtifacts.model, model), eq(protocolArtifacts.userCode, userCode)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return artifactRecord(row);
  }

  async consumeArtifact(
    model: ProtocolArtifactModel,
    id: string,
    now: Date,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .update(protocolArtifacts)
      .set({ consumedAt: now })
      .where(
        and(
          eq(protocolArtifacts.model, model),
          eq(protocolArtifacts.id, id),
          isNull(protocolArtifacts.consumedAt),
          gt(protocolArtifacts.expiresAt, now),
        ),
      )
      .returning();
    const row = rows[0];
    if (!row) return null;
    return artifactRecord(row);
  }

  async destroyArtifact(
    model: ProtocolArtifactModel,
    id: string,
    ctx?: TransactionContext,
  ): Promise<void> {
    const db = txOrDb(ctx, this.db);
    await db
      .delete(protocolArtifacts)
      .where(and(eq(protocolArtifacts.model, model), eq(protocolArtifacts.id, id)));
  }

  async revokeArtifactsByGrantId(
    grantId: string,
    now: Date,
    ctx?: TransactionContext,
  ): Promise<number> {
    const db = txOrDb(ctx, this.db);
    const rows = await db
      .update(protocolArtifacts)
      .set({ consumedAt: now })
      .where(and(eq(protocolArtifacts.grantId, grantId), isNull(protocolArtifacts.consumedAt)))
      .returning({ id: protocolArtifacts.id });
    return rows.length;
  }

  async cleanupExpiredArtifacts(now: Date, ctx?: TransactionContext): Promise<number> {
    const db = txOrDb(ctx, this.db);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .delete(protocolArtifacts)
      .where(
        sql`(${protocolArtifacts.expiresAt} IS NOT NULL AND ${protocolArtifacts.expiresAt} <= ${now}) OR (${protocolArtifacts.consumedAt} IS NOT NULL AND ${protocolArtifacts.consumedAt} <= ${sevenDaysAgo})`,
      )
      .returning({ id: protocolArtifacts.id });
    return rows.length;
  }
}

function txOrDb(ctx: TransactionContext | undefined, db: Database) {
  if (ctx && "transaction" in ctx) {
    return (ctx as PostgresTransactionContext).transaction;
  }
  return db;
}

function artifactRecord(row: typeof protocolArtifacts.$inferSelect): ProtocolArtifactRecord {
  return {
    model: row.model,
    id: row.id,
    grantId: row.grantId,
    payload: row.payload as Record<string, unknown>,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    uid: row.uid,
    userCode: row.userCode,
  };
}
