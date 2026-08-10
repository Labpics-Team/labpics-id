import type { Context, Next } from "hono";
import type { Logger } from "../lib/logger";
import type { AppVariables } from "../types";

/** Structured request logging via pino. */
export function requestLogger(logger: Logger) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    await next();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    logger.info(
      { requestId: c.get("requestId"), method, path, status: c.res.status, durationMs },
      "http request",
    );
  };
}
