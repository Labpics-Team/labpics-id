import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool } from "../src";

// Kept in sync with @labpics/testkit (POSTGRES_17_IMAGE) and docker-compose.yml.
const POSTGRES_17_IMAGE =
  "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317";

const migrationsFolder = join(import.meta.dir, "..", "drizzle");

// Testcontainers cannot drive dockerode over the Windows named pipe under Bun
// (bun's node:http socketPath layer is unsupported there). These integration
// tests therefore run on Linux/macOS (CI); on Windows the migration path is
// verified via `docker compose up -d` + `bun --cwd packages/db run migrate`.
const runContainerTests = process.platform !== "win32";

describe.skipIf(!runContainerTests)("@labpics/db migrations", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_17_IMAGE).start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it("applies migrations and creates every bootstrap table", async () => {
    const pool = createDbPool(container.getConnectionUri());
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
