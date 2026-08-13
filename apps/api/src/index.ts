import { PostgresRateLimitPort } from "@labpics/db";
import { createApp } from "./app";
import { createBetterAuthPort } from "./auth/better-auth.adapter";
import { createBootstrapControl } from "./bootstrap-control";
import { loadConfig } from "./config";
import { createDatabaseConnection } from "./lib/db";
import { createLogger } from "./lib/logger";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const database =
  config.databaseUrl !== undefined ? createDatabaseConnection(config.databaseUrl, logger) : null;
createBootstrapControl(
  {
    enabled: process.env.FIRST_ADMIN_BOOTSTRAP_ENABLED === "true",
    verifiedEmail: process.env.FIRST_ADMIN_BOOTSTRAP_EMAIL,
  },
  database,
);
if (config.authSecret === undefined) {
  throw new Error(
    "BETTER_AUTH_SECRET must be configured before composing the authentication adapter",
  );
}
const auth = createBetterAuthPort({
  runtime: config.nodeEnv,
  persistence: config.authPersistence,
  database: database?.db,
  secret: config.authSecret,
  baseUrl: config.authBaseUrl,
  trustedOrigins: config.corsAllowedOrigins,
});

const app = createApp({
  config,
  logger,
  database,
  auth,
  rateLimit: database === null ? undefined : new PostgresRateLimitPort(database.db),
});

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: (request) => app.fetch(request),
  error: (err) => {
    logger.error({ err }, "unhandled server error");
    return Response.json(
      { error: { code: "internal_error", message: "Internal Server Error" } },
      {
        status: 500,
      },
    );
  },
});

logger.info({ host: config.host, port: config.port }, "labpics-api listening");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.stop(true);
  if (database !== null) {
    await database.close();
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
