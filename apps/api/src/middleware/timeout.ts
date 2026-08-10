import type { Context, Next } from "hono";
import type { AppVariables } from "../types";

/**
 * Request timeout middleware. If the downstream handler does not settle within
 * `ms`, the client receives a 504 envelope instead of hanging forever.
 */
export function timeout(ms: number) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const signal = AbortSignal.timeout(ms);
    try {
      await Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("request_timeout")), {
            once: true,
          });
        }),
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === "request_timeout") {
        return c.json({ error: { code: "request_timeout", message: "Request timed out" } }, 504);
      }
      throw err;
    }
  };
}
