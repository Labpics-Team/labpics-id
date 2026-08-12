import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDbPool } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("session security migration", () => {
  const adminPool = connectionString === undefined ? null : createDbPool(connectionString);
  afterAll(async () => adminPool?.end());

  it("upgrades a populated 0002 database through 0003 with TTL backfill", async () => {
    if (adminPool === null || connectionString === undefined)
      throw new Error("TEST_DATABASE_URL is required");
    const databaseName = `session_migration_${crypto.randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    const databaseUrl = new URL(connectionString);
    databaseUrl.pathname = `/${databaseName}`;
    const pool = createDbPool(databaseUrl.toString());
    try {
      for (const migration of [
        "0000_classy_sentinel.sql",
        "0001_common_adam_destine.sql",
        "0002_common_lady_ursula.sql",
      ]) {
        await executeMigration(pool, migration);
      }
      const subjectId = `migration-subject-${crypto.randomUUID()}`;
      const sessionId = `migration-session-${crypto.randomUUID()}`;
      await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'Migration', $2)", [
        subjectId,
        `${subjectId}@example.com`,
      ]);
      const expiresAt = new Date("2026-08-13T00:00:00.000Z");
      await pool.query(
        "INSERT INTO sessions (id, expires_at, token, user_id) VALUES ($1, $2, $3, $4)",
        [sessionId, expiresAt, sessionId, subjectId],
      );

      await executeMigration(pool, "0003_cheerful_carmella_unuscione.sql");
      const row = await pool.query<{
        last_active_at: Date | null;
        absolute_expires_at: Date | null;
      }>("SELECT last_active_at, absolute_expires_at FROM sessions WHERE id = $1", [sessionId]);

      expect(row.rows[0]?.last_active_at).toBeInstanceOf(Date);
      expect(row.rows[0]?.absolute_expires_at).toEqual(expiresAt);
    } finally {
      await pool.end();
      await adminPool.query(`DROP DATABASE ${databaseName}`);
    }
  });
});

async function executeMigration(
  pool: ReturnType<typeof createDbPool>,
  name: string,
): Promise<void> {
  const sql = readFileSync(join(import.meta.dir, "..", "drizzle", name), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) await pool.query(trimmed);
  }
}
