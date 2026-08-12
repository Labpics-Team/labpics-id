import type {
  AuditEntry,
  AuditLogPort,
  CredentialPort,
  DeactivateSubjectCommand,
  IdentityRepository,
  OutboxEnvelope,
  OutboxPort,
  ProtocolRevocationPort,
  RegisterSubjectCommand,
  SessionView,
  SubjectView,
  TokenPurpose,
  TransactionContext,
  UserId,
} from "@labpics/domain";
import { Email, userId } from "@labpics/domain";
import { and, eq, gt } from "drizzle-orm";
import { accounts, auditEvents, outbox, sessions, users, verificationTokens } from "./schema";
import type { PostgresTransactionContext } from "./unit-of-work";

export class PostgresIdentityAdapter
  implements IdentityRepository, CredentialPort, AuditLogPort, OutboxPort, ProtocolRevocationPort
{
  async findSubjectById(
    context: TransactionContext,
    subjectId: UserId,
  ): Promise<SubjectView | null> {
    const rows = await transactionOf(context)
      .select()
      .from(users)
      .where(eq(users.id, subjectId))
      .limit(1);
    return rows[0] === undefined ? null : subjectView(rows[0]);
  }

  async findSubjectByEmail(context: TransactionContext, email: Email): Promise<SubjectView | null> {
    const rows = await transactionOf(context)
      .select()
      .from(users)
      .where(eq(users.email, email.toString()))
      .limit(1);
    return rows[0] === undefined ? null : subjectView(rows[0]);
  }

  async createSubject(
    context: TransactionContext,
    command: RegisterSubjectCommand,
  ): Promise<SubjectView> {
    const id = userId(crypto.randomUUID());
    const rows = await transactionOf(context)
      .insert(users)
      .values({ id, name: command.name, email: command.email.toString() })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new IdentityPersistenceError("subject insert returned no row");
    return subjectView(row);
  }

  async setEmailVerified(context: TransactionContext, subjectId: UserId): Promise<void> {
    await transactionOf(context)
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, subjectId));
  }

  async storeToken(
    context: TransactionContext,
    input: {
      readonly subjectId: UserId;
      readonly purpose: TokenPurpose;
      readonly digest: string;
      readonly expiresAt: Date;
    },
  ): Promise<void> {
    await transactionOf(context)
      .insert(verificationTokens)
      .values({
        id: crypto.randomUUID(),
        identifier: `${input.purpose}:${input.subjectId}`,
        value: input.digest,
        expiresAt: input.expiresAt,
      });
  }

  async consumeToken(
    context: TransactionContext,
    input: { readonly purpose: TokenPurpose; readonly digest: string; readonly now: Date },
  ): Promise<UserId | null> {
    const rows = await transactionOf(context)
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.value, input.digest),
          gt(verificationTokens.expiresAt, input.now),
        ),
      )
      .returning({ identifier: verificationTokens.identifier });
    const identifier = rows[0]?.identifier;
    if (identifier === undefined || !identifier.startsWith(`${input.purpose}:`)) return null;
    return userId(identifier.slice(input.purpose.length + 1));
  }

  async createSession(
    context: TransactionContext,
    subjectId: UserId,
    authenticatedAt: Date,
  ): Promise<SessionView> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(authenticatedAt.getTime() + 60 * 60 * 1000);
    await transactionOf(context).insert(sessions).values({
      id,
      userId: subjectId,
      token: crypto.randomUUID(),
      expiresAt,
      createdAt: authenticatedAt,
      updatedAt: authenticatedAt,
    });
    return {
      id,
      subjectId,
      authenticatedAt,
      expiresAt,
      authenticationMethods: ["password"],
      state: "active",
    };
  }

  async deactivateSubject(context: TransactionContext, subjectId: UserId): Promise<void> {
    await transactionOf(context)
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, subjectId));
  }

  async listSessions(
    context: TransactionContext,
    subjectId: UserId,
  ): Promise<readonly SessionView[]> {
    const rows = await transactionOf(context)
      .select()
      .from(sessions)
      .where(eq(sessions.userId, subjectId));
    return rows.map((row) => ({
      id: row.id,
      subjectId,
      authenticatedAt: row.createdAt,
      expiresAt: row.expiresAt,
      authenticationMethods: ["password"],
      state: row.revokedAt === null ? "active" : "revoked",
    }));
  }

  async revokeSession(context: TransactionContext, sessionId: string): Promise<void> {
    await transactionOf(context)
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async revokeSubjectSessions(context: TransactionContext, subjectId: UserId): Promise<void> {
    await transactionOf(context)
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, subjectId));
  }

  async storePassword(
    context: TransactionContext,
    subjectId: UserId,
    password: string,
  ): Promise<void> {
    const passwordHash = await Bun.password.hash(password);
    await transactionOf(context)
      .insert(accounts)
      .values({
        id: crypto.randomUUID(),
        accountId: subjectId,
        providerId: "credential",
        userId: subjectId,
        password: passwordHash,
      })
      .onConflictDoUpdate({
        target: [accounts.providerId, accounts.accountId],
        set: { password: passwordHash, updatedAt: new Date() },
      });
  }

  async verifyPassword(
    context: TransactionContext,
    subjectId: UserId,
    password: string,
  ): Promise<boolean> {
    const rows = await transactionOf(context)
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, subjectId), eq(accounts.providerId, "credential")))
      .limit(1);
    const passwordHash = rows[0]?.password;
    return passwordHash === null || passwordHash === undefined
      ? false
      : Bun.password.verify(password, passwordHash);
  }

  async record(context: TransactionContext, entry: AuditEntry): Promise<void> {
    await transactionOf(context)
      .insert(auditEvents)
      .values({ ...entry, hash: crypto.randomUUID() });
  }

  async enqueue(context: TransactionContext, envelope: OutboxEnvelope): Promise<void> {
    await transactionOf(context).insert(outbox).values({ type: envelope.type, payload: envelope });
  }

  async subjectDeactivated(
    context: TransactionContext,
    command: DeactivateSubjectCommand,
  ): Promise<void> {
    await this.enqueue(context, {
      idempotencyKey: `subject-deactivated:${command.subjectId}`,
      type: "identity.subject_deactivated",
      payload: { subjectId: command.subjectId },
      occurredAt: new Date(),
    });
  }
}

class IdentityPersistenceError extends Error {
  override readonly name = "IdentityPersistenceError";
}

function transactionOf(context: TransactionContext): PostgresTransactionContext["transaction"] {
  if (!("transaction" in context))
    throw new IdentityPersistenceError("Postgres transaction required");
  return context.transaction as PostgresTransactionContext["transaction"];
}

function subjectView(row: typeof users.$inferSelect): SubjectView {
  return {
    id: userId(row.id),
    email: Email.from(row.email),
    emailVerified: row.emailVerified,
    state: row.deactivatedAt === null ? "active" : "deactivated",
  };
}
