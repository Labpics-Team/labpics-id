import { afterAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("session security migration", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  afterAll(async () => pool?.end());

  it("backfills TTL columns when upgrading a populated 0002-shaped session row", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
    const subjectId = `migration-subject-${crypto.randomUUID()}`;
    const sessionId = `migration-session-${crypto.randomUUID()}`;
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'Migration', $2)", [
      subjectId,
      `${subjectId}@example.com`,
    ]);
    await pool.query(
      "INSERT INTO sessions (id, expires_at, token, user_id, last_active_at, absolute_expires_at) VALUES ($1, $2, $3, $4, NULL, NULL)",
      [sessionId, new Date("2026-08-13T00:00:00.000Z"), sessionId, subjectId],
    );
    await pool.query(
      "UPDATE sessions SET last_active_at = updated_at, absolute_expires_at = expires_at WHERE id = $1",
      [sessionId],
    );
    const row = await pool.query<{ last_active_at: Date | null; absolute_expires_at: Date | null }>(
      "SELECT last_active_at, absolute_expires_at FROM sessions WHERE id = $1",
      [sessionId],
    );

    expect(row.rows[0]?.last_active_at).toBeInstanceOf(Date);
    expect(row.rows[0]?.absolute_expires_at).toEqual(new Date("2026-08-13T00:00:00.000Z"));
  });
});
