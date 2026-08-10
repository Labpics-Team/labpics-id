import { Hono } from "hono";
import { createBetterAuthPort } from "./auth/better-auth.adapter";
import type { AppConfig } from "./config";
import type { DatabaseConnection } from "./lib/db";
import type { Logger } from "./lib/logger";
import { corsAllowlist } from "./middleware/cors-allowlist";
import { errorEnvelope } from "./middleware/error-envelope";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/request-logger";
import { timeout } from "./middleware/timeout";
import { healthRoutes } from "./routes/health";
import { readyRoutes } from "./routes/ready";
import { v1Routes } from "./routes/v1";
import type { AppVariables } from "./types";

export interface AppDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly database: DatabaseConnection | null;
}

export function createApp(deps: AppDeps) {
  const { config, logger, database } = deps;
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId());
  app.use("*", requestLogger(logger));
  app.use("*", corsAllowlist(config.corsAllowedOrigins));
  app.use("*", timeout(config.requestTimeoutMs));
  app.onError(errorEnvelope(logger));

  app.route("/", healthRoutes());
  app.route("/", readyRoutes(database, logger));
  app.route("/", v1Routes());

  // Better Auth is mounted behind a port wrapper: better-auth is imported only
  // in src/auth/better-auth.adapter.ts, lazily. `app.all` (not `mount`) is used
  // so the handler receives the original request with the full `/auth/*` path.
  const authPort = createBetterAuthPort({
    secret: config.betterAuthSecret,
    baseUrl: config.betterAuthUrl,
    trustedOrigins: config.corsAllowedOrigins,
  });
  app.all("/auth/*", (c) => authPort.fetch(c.req.raw));

  return app;
}
