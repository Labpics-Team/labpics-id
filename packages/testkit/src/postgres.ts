import { PostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Postgres 17, digest-pinned to the same image used by docker-compose.yml.
 * Kept in sync with packages/db (see packages/db/test/migrate.test.ts).
 */
export const POSTGRES_17_IMAGE =
  "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317";

export interface PostgresTestContainer {
  connectionString: string;
  stop(): Promise<void>;
}

/** Starts an ephemeral Postgres 17 container for integration tests. */
export async function startPostgres(): Promise<PostgresTestContainer> {
  const container = await new PostgreSqlContainer(POSTGRES_17_IMAGE).start();
  return {
    connectionString: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
