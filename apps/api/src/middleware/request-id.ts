import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import type { AppVariables } from "../types";

export const REQUEST_ID_HEADER = "x-request-id";

const MAX_INCOMING_LENGTH = 64;

/** Assigns a request id (echoing a trusted incoming header if short enough). */
export function requestId() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER);
    const id =
      incoming !== undefined && incoming.length <= MAX_INCOMING_LENGTH ? incoming : randomUUID();
    c.set("requestId", id);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  };
}
