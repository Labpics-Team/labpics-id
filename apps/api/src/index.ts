import {
  PostgresIdentityAdapter,
  PostgresProtocolAdapter,
  PostgresRateLimitPort,
  PostgresUnitOfWork,
} from "@labpics/db";
import { createIdentityUseCases, verificationResendBudget } from "@labpics/domain";
import { createApp } from "./app";
import { createBetterAuthPort } from "./auth/better-auth.adapter";
import { createBootstrapControl } from "./bootstrap-control";
import { loadConfig } from "./config";
import { createDatabaseConnection } from "./lib/db";
import { createLogger } from "./lib/logger";
import { createProtocolBoundaryHandlers } from "./routes/protocol-handlers";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const database =
  config.databaseUrl !== undefined ? createDatabaseConnection(config.databaseUrl, logger) : null;
const rateLimit = database === null ? undefined : new PostgresRateLimitPort(database.db);
const composedRateLimit = rateLimit;
createBootstrapControl(
  {
    enabled: process.env.FIRST_ADMIN_BOOTSTRAP_ENABLED === "true",
    verifiedEmail: process.env.FIRST_ADMIN_BOOTSTRAP_EMAIL,
  },
  database,
  rateLimit,
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

const lifecycleAdapter = database === null ? undefined : new PostgresIdentityAdapter();
const lifecycleUseCases =
  database === null || lifecycleAdapter === undefined || rateLimit === undefined
    ? undefined
    : createIdentityUseCases({
        repository: lifecycleAdapter,
        credentials: lifecycleAdapter,
        clock: { now: () => new Date() },
        tokens: {
          issue: async () => ({
            raw: "transport-hidden",
            digest: "transport-hidden",
            expiresAt: new Date(),
          }),
          digest: async (raw) => raw,
        },
        notifications: { enqueue: async () => undefined },
        rateLimit,
        audit: lifecycleAdapter,
        outbox: lifecycleAdapter,
        protocolRevocation: lifecycleAdapter,
        unitOfWork: new PostgresUnitOfWork(database.db),
      });

function composeProtocolHandlers(db: NonNullable<typeof database>["db"]) {
  const adapter = new PostgresProtocolAdapter(db);
  return createProtocolBoundaryHandlers({
    unitOfWork: new PostgresUnitOfWork(db),
    clientRegistry: adapter,
    consent: adapter,
    signingKeys: adapter,
    artifacts: adapter,
  });
}
const protocolHandlers = database === null ? undefined : composeProtocolHandlers(database.db);

const app = createApp({
  config,
  logger,
  database,
  auth,
  rateLimit,
  protocolHandlers,
  lifecycleUseCases:
    lifecycleUseCases === undefined || composedRateLimit === undefined
      ? undefined
      : {
          requestPasswordReset: lifecycleUseCases.requestPasswordReset.bind(lifecycleUseCases),
          resendVerification: async ({ email }) =>
            verificationResendBudget({ rateLimit: composedRateLimit }, email.toString(), "api"),
        },
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
