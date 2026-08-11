import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppVariables } from "../types";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Assigns a request id (echoing a trusted incoming header if short enough). */
export function requestId() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const id =
      incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    c.set("requestId", id);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  };
}
