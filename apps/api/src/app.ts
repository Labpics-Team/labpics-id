import type { RateLimitPort } from "@labpics/domain";
import { Hono } from "hono";
import type { AuthPort } from "./auth/port";
import type { AppConfig } from "./config";
import type { DatabaseConnection } from "./lib/db";
import type { Logger } from "./lib/logger";
import { corsAllowlist } from "./middleware/cors-allowlist";
import { errorEnvelope } from "./middleware/error-envelope";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/request-logger";
import { timeout } from "./middleware/timeout";
import { healthRoutes } from "./routes/health";
import { internalProtocolRoutes } from "./routes/internal-protocol";
import type { LifecycleUseCases } from "./routes/lifecycle";
import { lifecycleRoutes } from "./routes/lifecycle";
import { readyRoutes } from "./routes/ready";
import { v1Routes } from "./routes/v1";
import type { AppVariables } from "./types";

export interface AppDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly database: DatabaseConnection | null;
  readonly auth: AuthPort;
  readonly rateLimit: RateLimitPort | undefined;
  readonly lifecycleUseCases: LifecycleUseCases | undefined;
}

export function createApp(deps: AppDeps) {
  const { config, logger, database, auth, rateLimit, lifecycleUseCases } = deps;
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId());
  app.use("*", requestLogger(logger));
  app.use("*", corsAllowlist(config.corsAllowedOrigins));
  app.use("*", timeout(config.requestTimeoutMs));
  app.onError(errorEnvelope(logger));

  app.route("/", healthRoutes());
  app.route("/", lifecycleRoutes(rateLimit, lifecycleUseCases));
  app.route("/", readyRoutes(database, logger));
  app.route("/", v1Routes());
  app.route(
    "/",
    internalProtocolRoutes({
      logger,
      boundaryCredentials: config.boundaryCredentials,
    }),
  );

  app.all("/auth/*", (c) => auth.fetch(c.req.raw));

  return app;
}
