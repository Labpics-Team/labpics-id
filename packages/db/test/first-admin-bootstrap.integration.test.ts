import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Email } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, FirstAdminBootstrap } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined).serial("D14 first administrator bootstrap", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  afterAll(async () => pool?.end());

  it("creates exactly one verified administrator under concurrent claims", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await clearState(pool);
    const bootstrap = new FirstAdminBootstrap(createDb(pool));
    const email = Email.from(`owner-${crypto.randomUUID()}@example.com`);
    const rawToken = crypto.randomUUID();
    await bootstrap.createToken({ email, rawToken, expiresAt: new Date("2026-08-13T00:00:00Z") });
    const results = await Promise.all([
      bootstrap.claim({ rawToken, verifiedEmail: email, now: new Date("2026-08-12T00:00:00Z") }),
      bootstrap.claim({ rawToken, verifiedEmail: email, now: new Date("2026-08-12T00:00:00Z") }),
    ]);
    expect(results.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "rejected")).toHaveLength(1);
    const persisted = await pool.query<{ users: number; admins: number }>(
      "SELECT (SELECT count(*)::int FROM users) users, (SELECT count(*)::int FROM platform_administrators) admins",
    );
    expect(persisted.rows[0]).toEqual({ users: 1, admins: 1 });
    const stored = await pool.query<{ token_digest: string }>(
      "SELECT token_digest FROM bootstrap_tokens",
    );
    expect(stored.rows[0]?.token_digest).not.toBe(rawToken);
    const durable = await pool.query<{
      id: string;
      actor_id: string;
      action: string;
      target_type: string;
      target_id: string;
      ip: string | null;
      user_agent: string | null;
      occurred_at: Date;
      prev_hash: string | null;
      hash: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT a.id,a.actor_id,a.action,a.target_type,a.target_id,a.ip,a.user_agent,
              a.occurred_at,a.prev_hash,a.hash,o.payload
       FROM audit_events a JOIN outbox o ON o.type = 'identity.first_admin_bootstrapped'`,
    );
    expect(durable.rows).toHaveLength(1);
    expect(JSON.stringify(durable.rows[0])).not.toContain(rawToken);
    expect(JSON.stringify(durable.rows[0])).not.toContain("password");
  });

  it("serializes two different valid tokens racing on an empty platform", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await clearState(pool);
    const bootstrap = new FirstAdminBootstrap(createDb(pool));
    const email = Email.from(`owner-${crypto.randomUUID()}@example.com`);
    const tokens = [crypto.randomUUID(), crypto.randomUUID()] as const;
    for (const rawToken of tokens) {
      await bootstrap.createToken({ email, rawToken, expiresAt: new Date("2026-08-13T00:00:00Z") });
    }
    const settled = await Promise.allSettled(
      tokens.map((rawToken) =>
        bootstrap.claim({ rawToken, verifiedEmail: email, now: new Date("2026-08-12T00:00:00Z") }),
      ),
    );
    const values = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(0);
    expect(values.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(values.filter((result) => result.kind === "rejected")).toHaveLength(1);
  });

  it("rolls every effect back when bootstrap fails after user creation", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await clearState(pool);
    const bootstrap = new FirstAdminBootstrap(createDb(pool));
    const email = Email.from(`owner-${crypto.randomUUID()}@example.com`);
    const rawToken = crypto.randomUUID();
    await bootstrap.createToken({ email, rawToken, expiresAt: new Date("2026-08-13T00:00:00Z") });

    await pool.query(`CREATE OR REPLACE FUNCTION fail_admin_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected bootstrap failure'; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER fail_admin_insert BEFORE INSERT ON platform_administrators
      FOR EACH ROW EXECUTE FUNCTION fail_admin_insert()`);
    try {
      let rejected = false;
      try {
        await bootstrap.claim({
          rawToken,
          verifiedEmail: email,
          now: new Date("2026-08-12T00:00:00Z"),
        });
      } catch (error) {
        rejected = error instanceof Error;
      }
      expect(rejected).toBe(true);
    } finally {
      await pool.query("DROP TRIGGER fail_admin_insert ON platform_administrators");
      await pool.query("DROP FUNCTION fail_admin_insert() ");
    }
    const counts = await pool.query<{
      users: number;
      admins: number;
      consumed: number;
      audits: number;
      envelopes: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM users) users,
        (SELECT count(*)::int FROM platform_administrators) admins,
        (SELECT count(*)::int FROM bootstrap_tokens WHERE consumed_at IS NOT NULL) consumed,
        (SELECT count(*)::int FROM audit_events) audits,
        (SELECT count(*)::int FROM outbox) envelopes`,
    );
    expect(counts.rows[0]).toEqual({ users: 0, admins: 0, consumed: 0, audits: 0, envelopes: 0 });
  });

  it.each(["wrong_email", "expired", "replay", "non_empty"] as const)(
    "rejects %s",
    async (scenario) => {
      if (pool === null) throw new Error("TEST_DATABASE_URL is required");
      await clearState(pool);
      const bootstrap = new FirstAdminBootstrap(createDb(pool));
      const email = Email.from(`owner-${crypto.randomUUID()}@example.com`);
      const rawToken = crypto.randomUUID();
      await bootstrap.createToken({ email, rawToken, expiresAt: new Date("2026-08-13T00:00:00Z") });
      if (scenario === "non_empty") {
        await pool.query(
          "INSERT INTO users (id,name,email) VALUES ('existing','Existing','existing@example.com')",
        );
      }
      const first = await bootstrap.claim({
        rawToken,
        verifiedEmail: scenario === "wrong_email" ? Email.from("wrong@example.com") : email,
        now:
          scenario === "expired"
            ? new Date("2026-08-14T00:00:00Z")
            : new Date("2026-08-12T00:00:00Z"),
      });
      if (scenario === "replay" && first.kind === "created") {
        expect(
          await bootstrap.claim({
            rawToken,
            verifiedEmail: email,
            now: new Date("2026-08-12T00:00:01Z"),
          }),
        ).toEqual({ kind: "rejected" });
      } else {
        expect(first).toEqual({ kind: "rejected" });
      }
    },
  );
});

async function clearState(pool: ReturnType<typeof createDbPool>) {
  await pool.query(
    "TRUNCATE outbox,audit_events,platform_administrators,bootstrap_tokens,member,accounts,sessions,verification_tokens,users CASCADE",
  );
}
