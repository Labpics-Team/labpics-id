import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  accounts,
  auditEvents,
  createDb,
  createDbPool,
  organization,
  outbox,
  PostgresUnitOfWork,
  sessions,
  users,
} from "../src";

const POSTGRES_17_IMAGE =
  "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317";
const migrationsFolder = join(import.meta.dir, "..", "drizzle");
const dbTestConnection = process.env.TEST_DATABASE_URL;
const runDbTest = dbTestConnection !== undefined || process.platform !== "win32";

describe.skipIf(!runDbTest)("PostgresUnitOfWork", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let pool: ReturnType<typeof createDbPool> | null = null;

  beforeAll(async () => {
    if (dbTestConnection === undefined) {
      container = await new PostgreSqlContainer(POSTGRES_17_IMAGE).start();
    }
    const connectionString = dbTestConnection ?? container?.getConnectionUri();
    if (connectionString === undefined) {
      throw new Error("no test database connection available");
    }
    pool = createDbPool(connectionString);
    await migrate(createDb(pool), { migrationsFolder });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("commits source state, audit, and outbox rows together", async () => {
    const db = createDb(requirePool());
    const unitOfWork = new PostgresUnitOfWork(db);
    const id = `uow-success-${crypto.randomUUID()}`;

    await unitOfWork.run(async ({ transaction }) => {
      await transaction.insert(organization).values({ id, name: "UoW success", slug: id });
      await transaction.insert(auditEvents).values({
        actorId: "test-actor",
        action: "organization.created",
        targetType: "organization",
        targetId: id,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        hash: `hash-${id}`,
      });
      await transaction.insert(outbox).values({
        type: "organization.created",
        payload: { idempotencyKey: id, organizationId: id },
      });
    });

    expect(await rowCounts(requirePool(), id)).toEqual({ source: 1, audit: 1, outbox: 1 });
  });

  for (const failurePoint of ["after-audit", "after-outbox"] as const) {
    it(`rolls every row back when work throws ${failurePoint}`, async () => {
      const db = createDb(requirePool());
      const unitOfWork = new PostgresUnitOfWork(db);
      const id = `uow-${failurePoint}-${crypto.randomUUID()}`;

      const result = unitOfWork.run(async ({ transaction }) => {
        await transaction.insert(organization).values({ id, name: "UoW rollback", slug: id });
        await transaction.insert(auditEvents).values({
          actorId: "test-actor",
          action: "organization.created",
          targetType: "organization",
          targetId: id,
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
          hash: `hash-${id}`,
        });
        if (failurePoint === "after-audit") throw new InjectedFailure(failurePoint);
        await transaction.insert(outbox).values({
          type: "organization.created",
          payload: { idempotencyKey: id, organizationId: id },
        });
        throw new InjectedFailure(failurePoint);
      });

      await expect(result).rejects.toBeInstanceOf(InjectedFailure);
      expect(await rowCounts(requirePool(), id)).toEqual({ source: 0, audit: 0, outbox: 0 });
    });
  }

  for (const failurePoint of [
    "after-user",
    "after-session",
    "after-audit",
    "after-outbox",
  ] as const) {
    it(`rolls identity, audit, and outbox state back when work throws ${failurePoint}`, async () => {
      const db = createDb(requirePool());
      const unitOfWork = new PostgresUnitOfWork(db);
      const id = `identity-${failurePoint}-${crypto.randomUUID()}`;

      const result = unitOfWork.run(async ({ transaction }) => {
        await transaction
          .insert(users)
          .values({ id, name: "Identity rollback", email: `${id}@example.com` });
        if (failurePoint === "after-user") throw new IdentityInjectedFailure(failurePoint);
        await transaction.insert(accounts).values({
          id: `account-${id}`,
          accountId: id,
          providerId: "credential",
          userId: id,
          password: "opaque-hash",
        });
        await transaction.insert(sessions).values({
          id: `session-${id}`,
          token: `token-${id}`,
          userId: id,
          expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        });
        if (failurePoint === "after-session") throw new IdentityInjectedFailure(failurePoint);
        await transaction.insert(auditEvents).values({
          actorId: id,
          action: "identity.registered",
          targetType: "subject",
          targetId: id,
          occurredAt: new Date("2026-08-12T00:00:00.000Z"),
          hash: `hash-${id}`,
        });
        if (failurePoint === "after-audit") throw new IdentityInjectedFailure(failurePoint);
        await transaction.insert(outbox).values({
          type: "identity.registered",
          payload: { idempotencyKey: id, subjectId: id },
        });
        throw new IdentityInjectedFailure(failurePoint);
      });

      await expect(result).rejects.toBeInstanceOf(IdentityInjectedFailure);
      expect(await identityRowCounts(requirePool(), id)).toEqual({
        users: 0,
        accounts: 0,
        sessions: 0,
        audit: 0,
        outbox: 0,
      });
    });
  }

  function requirePool(): ReturnType<typeof createDbPool> {
    if (pool === null) throw new Error("test database pool is not initialized");
    return pool;
  }
});

class InjectedFailure extends Error {
  readonly failurePoint: "after-audit" | "after-outbox";

  constructor(failurePoint: "after-audit" | "after-outbox") {
    super(`injected failure ${failurePoint}`);
    this.failurePoint = failurePoint;
  }
}

class IdentityInjectedFailure extends Error {
  readonly failurePoint: "after-user" | "after-session" | "after-audit" | "after-outbox";

  constructor(failurePoint: "after-user" | "after-session" | "after-audit" | "after-outbox") {
    super(`injected identity failure ${failurePoint}`);
    this.failurePoint = failurePoint;
  }
}

async function rowCounts(dbPool: ReturnType<typeof createDbPool>, id: string) {
  const [source, audit, outboxRows] = await Promise.all([
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM organization WHERE id = $1",
      [id],
    ),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_events WHERE target_id = $1",
      [id],
    ),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox WHERE payload ->> 'idempotencyKey' = $1",
      [id],
    ),
  ]);
  return {
    source: source.rows[0]?.count ?? 0,
    audit: audit.rows[0]?.count ?? 0,
    outbox: outboxRows.rows[0]?.count ?? 0,
  };
}

async function identityRowCounts(dbPool: ReturnType<typeof createDbPool>, id: string) {
  const [userRows, accountRows, sessionRows, auditRows, outboxRows] = await Promise.all([
    dbPool.query<{ count: number }>("SELECT count(*)::int AS count FROM users WHERE id = $1", [id]),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM accounts WHERE user_id = $1",
      [id],
    ),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM sessions WHERE user_id = $1",
      [id],
    ),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_events WHERE target_id = $1",
      [id],
    ),
    dbPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox WHERE payload ->> 'idempotencyKey' = $1",
      [id],
    ),
  ]);
  return {
    users: userRows.rows[0]?.count ?? 0,
    accounts: accountRows.rows[0]?.count ?? 0,
    sessions: sessionRows.rows[0]?.count ?? 0,
    audit: auditRows.rows[0]?.count ?? 0,
    outbox: outboxRows.rows[0]?.count ?? 0,
  };
}
