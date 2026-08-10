import type { Context, Next } from "hono";
import type { AppVariables } from "../types";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, x-request-id";
const MAX_AGE_SECONDS = "600";

/**
 * CORS allowlist middleware. Only origins listed in the configured allowlist
 * receive CORS headers; preflight for any other origin is rejected.
 */
export function corsAllowlist(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const origin = c.req.header("Origin");
    c.header("Vary", "Origin");
    const isAllowed = origin !== undefined && allowed.has(origin);
    if (isAllowed) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
      c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      c.header("Access-Control-Max-Age", MAX_AGE_SECONDS);
    }
    if (c.req.method === "OPTIONS") {
      if (isAllowed) return c.body(null, 204);
      return c.json(
        { error: { code: "cors_origin_not_allowed", message: "Origin not allowed" } },
        403,
      );
    }
    await next();
  };
}
