import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle>;

/** Creates a pg connection pool bound to DATABASE_URL. Connections are lazy. */
export function createDbPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 3_000 });
}

/** Creates a Drizzle client bound to a pool, with the full schema registered. */
export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}
