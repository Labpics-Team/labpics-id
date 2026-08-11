import type { Context, Next } from "hono";
import type { AppVariables } from "../types";

/**
 * Request timeout middleware. If the downstream handler does not settle within
 * `ms`, the client receives a 504 envelope and `request.raw.signal` is aborted
 * so cancellation-aware downstream I/O can stop. JavaScript that ignores the
 * signal may continue running; this is not a CPU-exhaustion boundary.
 */
export function timeout(ms: number) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const controller = new AbortController();
    const request = new Request(c.req.raw, { signal: controller.signal });
    const timeoutError = new Error("request_timeout");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      c.req.raw = request;
      await Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
          }, ms);
        }),
      ]);
    } catch (err) {
      if (err === timeoutError) {
        return c.json({ error: { code: "request_timeout", message: "Request timed out" } }, 504);
      }
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
