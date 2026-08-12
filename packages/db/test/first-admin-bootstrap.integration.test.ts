import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Email } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, FirstAdminBootstrap } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("D14 first administrator bootstrap", () => {
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
