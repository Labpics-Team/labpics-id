import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createIdentityUseCases } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresIdentityAdapter, PostgresUnitOfWork } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("IdentityUseCases atomicity", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);

  beforeAll(async () => {
    if (pool === null) throw new TestConfigurationError();
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });

  afterAll(async () => {
    await pool?.end();
  });

  for (const fault of ["after_identity", "after_audit", "after_outbox"] as const) {
    it(`rolls back the production registration use case on ${fault}`, async () => {
      if (pool === null) throw new TestConfigurationError();
      const email = `use-case-${fault}-${crypto.randomUUID()}@example.com`;
      const adapter = new FaultInjectingIdentityAdapter(fault);
      const useCases = createIdentityUseCases({
        repository: adapter,
        credentials: adapter,
        clock: { now: () => new Date("2026-08-12T00:00:00.000Z") },
        tokens: {
          issue: async () => ({
            raw: "deliver-once",
            digest: "persist-only",
            expiresAt: new Date("2026-08-13T00:00:00.000Z"),
          }),
          digest: async (raw) => raw,
        },
        notifications: { enqueue: async () => undefined },
        rateLimit: { consume: async () => ({ kind: "allowed" }) },
        audit: adapter,
        outbox: adapter,
        protocolRevocation: adapter,
        unitOfWork: new PostgresUnitOfWork(createDb(pool)),
      });

      await expect(
        useCases.register({
          email: (await import("@labpics/domain")).Email.from(email),
          name: "Atomic User",
          password: "correct horse battery staple",
        }),
      ).rejects.toBeInstanceOf(InjectedUseCaseFailure);
      const subjectId = adapter.createdSubjectId;
      if (subjectId === null) throw new MissingSubjectEvidenceError();

      const [users, audits, envelopes] = await Promise.all([
        pool.query<{ count: number }>("SELECT count(*)::int AS count FROM users WHERE id = $1", [
          subjectId,
        ]),
        pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM audit_events WHERE target_id = $1",
          [subjectId],
        ),
        pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM outbox WHERE payload -> 'payload' ->> 'subjectId' = $1",
          [subjectId],
        ),
      ]);
      expect({
        users: users.rows[0]?.count ?? 0,
        audits: audits.rows[0]?.count ?? 0,
        envelopes: envelopes.rows[0]?.count ?? 0,
      }).toEqual({ users: 0, audits: 0, envelopes: 0 });
    });
  }
});

class FaultInjectingIdentityAdapter extends PostgresIdentityAdapter {
  private readonly fault: "after_identity" | "after_audit" | "after_outbox";
  createdSubjectId: string | null = null;

  constructor(fault: "after_identity" | "after_audit" | "after_outbox") {
    super();
    this.fault = fault;
  }

  override async createSubject(...args: Parameters<PostgresIdentityAdapter["createSubject"]>) {
    const subject = await super.createSubject(...args);
    this.createdSubjectId = subject.id;
    return subject;
  }

  override async storePassword(...args: Parameters<PostgresIdentityAdapter["storePassword"]>) {
    await super.storePassword(...args);
    if (this.fault === "after_identity") throw new InjectedUseCaseFailure(this.fault);
  }

  override async record(...args: Parameters<PostgresIdentityAdapter["record"]>) {
    await super.record(...args);
    if (this.fault === "after_audit") throw new InjectedUseCaseFailure(this.fault);
  }

  override async enqueue(...args: Parameters<PostgresIdentityAdapter["enqueue"]>) {
    await super.enqueue(...args);
    if (this.fault === "after_outbox") throw new InjectedUseCaseFailure(this.fault);
  }
}

class InjectedUseCaseFailure extends Error {
  override readonly name = "InjectedUseCaseFailure";
}

class TestConfigurationError extends Error {
  override readonly name = "TestConfigurationError";
}

class MissingSubjectEvidenceError extends Error {
  override readonly name = "MissingSubjectEvidenceError";
}
