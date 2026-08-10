import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool } from "../src";

// Kept in sync with @labpics/testkit (POSTGRES_17_IMAGE) and docker-compose.yml.
const POSTGRES_17_IMAGE =
  "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317";

const migrationsFolder = join(import.meta.dir, "..", "drizzle");

// Migration test. Priority: TEST_DATABASE_URL (CI/compose) → Testcontainers
// (local Linux/macOS). On Windows, bun cannot drive dockerode over the named
// pipe, so without TEST_DATABASE_URL the suite is skipped (the Windows
// migration path is covered by `docker compose up -d` + migrate).
const dbTestConnection = process.env.TEST_DATABASE_URL;
const runDbTest = dbTestConnection !== undefined || process.platform !== "win32";

describe.skipIf(!runDbTest)("@labpics/db migrations", () => {
  let container: StartedPostgreSqlContainer | null = null;

  beforeAll(async () => {
    if (dbTestConnection !== undefined) return;
    container = await new PostgreSqlContainer(POSTGRES_17_IMAGE).start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it("applies migrations and creates every bootstrap table", async () => {
    const connectionString = dbTestConnection ?? container?.getConnectionUri();
    if (connectionString === undefined) {
      throw new Error("no test database connection available");
    }
    const pool = createDbPool(connectionString);
    const db = createDb(pool);
    try {
      await migrate(db, { migrationsFolder });

      const tablesResult = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      );
      const tables = tablesResult.rows.map((r) => r.table_name as string);
      const expected = [
        "users",
        "sessions",
        "accounts",
        "verification_tokens",
        "audit_events",
        "outbox",
        "organization",
        "member",
        "role",
        "permission",
        "product_access",
      ];
      for (const table of expected) {
        expect(tables).toContain(table);
      }

      const auditColumnsResult = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_events' ORDER BY ordinal_position",
      );
      const auditColumns = auditColumnsResult.rows.map((r) => r.column_name as string);
      expect(auditColumns).toContain("hash");
      expect(auditColumns).toContain("prev_hash");
      expect(auditColumns).toContain("occurred_at");
    } finally {
      await pool.end();
    }
  });
});
