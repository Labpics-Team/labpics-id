import type { NotReadyResponse, ReadyResponse } from "@labpics/contracts";
import { Hono } from "hono";
import type { DatabaseConnection } from "../lib/db";
import type { Logger } from "../lib/logger";
import type { AppVariables } from "../types";

export function readyRoutes(database: DatabaseConnection | null, logger: Logger) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.get("/ready", async (c) => {
    const requestId = c.get("requestId");
    if (database === null) {
      logger.info({ requestId }, "readiness: database not configured");
      return c.json(
        {
          status: "not_ready",
          database: "down",
          reason: "database not configured",
        } satisfies NotReadyResponse,
        503,
      );
    }
    try {
      await database.ready();
      return c.json({ status: "ready", database: "up" } satisfies ReadyResponse, 200);
    } catch (err) {
      logger.error({ requestId, err }, "readiness: database unreachable");
      return c.json(
        {
          status: "not_ready",
          database: "down",
          reason: "database unreachable",
        } satisfies NotReadyResponse,
        503,
      );
    }
  });
  return app;
}
