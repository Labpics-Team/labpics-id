import type { ErrorEnvelope } from "@labpics/contracts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "../lib/logger";
import type { AppVariables } from "../types";

/**
 * Global error envelope. Client-visible errors are always `{ error: { code,
 * message } }`; internal errors are logged with full detail but the response
 * never leaks stack traces or internal error text.
 */
export function errorEnvelope(logger: Logger) {
  return async (err: Error, c: Context<{ Variables: AppVariables }>) => {
    const requestId = c.get("requestId");
    if (err instanceof HTTPException) {
      logger.warn({ requestId, status: err.status, message: err.message }, "http exception");
      return c.json(
        { error: { code: "http_error", message: err.message } } satisfies ErrorEnvelope,
        err.status,
      );
    }
    logger.error({ requestId, err }, "unhandled error");
    return c.json(
      {
        error: { code: "internal_error", message: "Internal Server Error" },
      } satisfies ErrorEnvelope,
      500,
    );
  };
}
