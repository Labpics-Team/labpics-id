import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresRateLimitPort } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("shared abuse controls", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  beforeEach(async () => {
    await pool?.query("TRUNCATE auth_rate_limits, audit_events, outbox");
  });
  afterAll(async () => pool?.end());

  it("shares the budget across two application instances", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const now = () => new Date("2026-08-12T00:00:00Z");
    const first = new PostgresRateLimitPort(createDb(pool), now);
    const second = new PostgresRateLimitPort(createDb(pool), now);
    const key = crypto.randomUUID();
    expect(await first.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await second.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await first.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await second.consume({ action: "sign_in", key })).toMatchObject({ kind: "limited" });
  });

  it("recovers after lockout expiry", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    let now = new Date("2026-08-12T00:00:00Z");
    const limiter = new PostgresRateLimitPort(createDb(pool), () => now);
    const key = crypto.randomUUID();
    for (let index = 0; index < 4; index += 1) {
      await limiter.consume({ action: "sign_in", key, source: "source-a" });
    }
    expect(await limiter.consume({ action: "sign_in", key, source: "source-a" })).toMatchObject({
      kind: "limited",
    });
    now = new Date("2026-08-12T00:16:00Z");
    expect(await limiter.consume({ action: "sign_in", key, source: "source-a" })).toEqual({
      kind: "allowed",
    });
  });

  it("prevents one source from globally locking a victim while account dimension limits distribution", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const limiter = new PostgresRateLimitPort(
      createDb(pool),
      () => new Date("2026-08-12T00:00:00Z"),
    );
    const victim = `victim-${crypto.randomUUID()}@example.com`;
    for (let index = 0; index < 4; index += 1)
      await limiter.consume({ action: "sign_in", key: victim, source: "attacker-a" });
    expect(
      await limiter.consume({ action: "sign_in", key: victim, source: "legitimate-b" }),
    ).toEqual({ kind: "allowed" });
    for (const source of ["c", "d", "e"])
      await limiter.consume({ action: "sign_in", key: victim, source });
    expect(
      await limiter.consume({ action: "sign_in", key: victim, source: "legitimate-b" }),
    ).toMatchObject({ kind: "limited" });
  });

  it("stores only action-bound digests and writes lockout audit plus outbox", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const limiter = new PostgresRateLimitPort(
      createDb(pool),
      () => new Date("2026-08-12T00:00:00Z"),
    );
    const email = `raw-${crypto.randomUUID()}@example.com`;
    for (let index = 0; index < 4; index += 1)
      await limiter.consume({ action: "password_reset", key: email, source: "source" });
    const raw = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM auth_rate_limits WHERE concat_ws(' ',action,key_digest) LIKE $1",
      [`%${email}%`],
    );
    expect(raw.rows[0]?.count).toBe(0);
    expect(
      (await pool.query("SELECT 1 FROM audit_events WHERE action='identity.auth_lockout'"))
        .rowCount,
    ).toBeGreaterThan(0);
    expect(
      (await pool.query("SELECT 1 FROM outbox WHERE type='identity.auth_lockout'")).rowCount,
    ).toBeGreaterThan(0);
  });

  it("limits repeated bootstrap claim attempts through the production bootstrap service", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const { FirstAdminBootstrap } = await import("../src");
    const limiter = new PostgresRateLimitPort(
      createDb(pool),
      () => new Date("2026-08-12T00:00:00Z"),
    );
    const bootstrap = new FirstAdminBootstrap(createDb(pool), limiter);
    const { Email } = await import("@labpics/domain");
    const email = Email.from(`bootstrap-${crypto.randomUUID()}@example.com`);
    for (let index = 0; index < 4; index += 1) {
      await bootstrap.claim({
        rawToken: `invalid-${index}`,
        verifiedEmail: email,
        now: new Date("2026-08-12T00:00:00Z"),
      });
    }
    const stored = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM auth_rate_limits WHERE action='bootstrap_claim'",
    );
    expect(stored.rows[0]?.count).toBeGreaterThan(0);
  });

  it("fails closed when the shared store is unavailable", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const limiter = new PostgresRateLimitPort(createDb(pool), undefined, async () => {
      throw new Error("shared store unavailable");
    });
    expect(await limiter.consume({ action: "password_reset", key: "source" })).toMatchObject({
      kind: "limited",
    });
  });

  it("fails closed when the real pool is closed", async () => {
    if (connectionString === undefined) throw new Error("TEST_DATABASE_URL is required");
    const closedPool = createDbPool(connectionString);
    await closedPool.end();
    const limiter = new PostgresRateLimitPort(createDb(closedPool));
    expect(
      await limiter.consume({ action: "sign_in", key: "account", source: "source" }),
    ).toMatchObject({
      kind: "limited",
    });
  });
});
