import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDatabaseConnection } from "./lib/db";
import { createLogger } from "./lib/logger";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const database =
  config.databaseUrl !== undefined ? createDatabaseConnection(config.databaseUrl, logger) : null;

const app = createApp({ config, logger, database });

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
