import { createDb, createDbPool, type Database } from "@labpics/db";
import type { Pool } from "pg";
import type { Logger } from "./logger";

export interface DatabaseConnection {
  readonly pool: Pool;
  readonly db: Database;
  ready(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabaseConnection(
  connectionString: string,
  logger: Logger,
): DatabaseConnection {
  const pool = createDbPool(connectionString);
  pool.on("error", (err) => logger.error({ err }, "pg pool error"));
  const db = createDb(pool);
  return {
    pool,
    db,
    async ready() {
      await pool.query("SELECT 1");
    },
    async close() {
      await pool.end();
    },
  };
}
