import {
  type BoundaryOperation,
  type BoundaryRequest,
  boundarySuccessSchema,
  boundaryVersion,
} from "@labpics/contracts";
import {
  type AuthenticatedBoundaryRequest,
  authenticateBoundaryRequest,
  BoundaryTransportError,
  boundaryFailure,
  MemoryReplayStore,
  parseBoundaryCredentials,
  type ReplayStore,
} from "@labpics/contracts/boundary-auth";
import { Hono } from "hono";
import type { Logger } from "../lib/logger";
import type { AppVariables } from "../types";

/**
 * Internal API↔Protocol boundary endpoint. Every request must carry a valid
 * workload HMAC, a fresh nonce and an authorized operation; anything else
 * fails closed with a typed error (ch03 invariant 5). Operations without a
 * registered handler are rejected, never faked: real handlers land with
 * ch03-platform-stores.
 */

export type BoundaryOperationHandler = (
  request: Extract<BoundaryRequest, { operation: BoundaryOperation }>,
) => Promise<unknown>;

export interface InternalProtocolDeps {
  readonly logger: Logger;
  readonly boundaryCredentials: readonly unknown[] | undefined;
  readonly handlers?: Partial<Record<BoundaryOperation, BoundaryOperationHandler>>;
  readonly replayStore?: ReplayStore;
  readonly maxRequestBytes?: number;
}

const DEFAULT_MAX_REQUEST_BYTES = 262_144;

/**
 * The internal hop must never carry caller-supplied identity or forwarding
 * headers: their presence is either a spoofing attempt or a misconfigured
 * proxy, and the request is rejected before authentication (ch03 invariant 5).
 */
const FORBIDDEN_CALLER_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "x-labpics-subject",
  "x-labpics-session",
  "x-labpics-workload",
] as const;

function statusFor(code: BoundaryTransportError["code"]): 400 | 401 | 403 | 409 | 500 {
  switch (code) {
    case "authentication_failed":
      return 401;
    case "authorization_denied":
      return 403;
    case "replay_detected":
      return 409;
    case "operation_failed":
      return 500;
    default:
      return 400;
  }
}

export function internalProtocolRoutes(deps: InternalProtocolDeps) {
  const credentials = parseBoundaryCredentials(deps.boundaryCredentials);
  const replayStore = deps.replayStore ?? new MemoryReplayStore();
  const handlers = deps.handlers ?? {};
  const maxRequestBytes = deps.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const app = new Hono<{ Variables: AppVariables }>();

  app.post("/internal/protocol/v1", async (c) => {
    if (credentials.length === 0) {
      // Boundary without configured credentials must not accept anything.
      const error = new BoundaryTransportError(
        "authentication_failed",
        "Boundary credentials are not configured",
        false,
        "00000000-0000-4000-8000-000000000000",
      );
      return c.json(boundaryFailure(error), statusFor(error.code));
    }

    for (const name of FORBIDDEN_CALLER_HEADERS) {
      if (c.req.header(name) !== undefined) {
        const error = new BoundaryTransportError(
          "schema_invalid",
          "Caller-supplied identity or forwarding headers are forbidden",
          false,
          "00000000-0000-4000-8000-000000000000",
        );
        deps.logger.warn({ header: name }, "Boundary request carried a forbidden header");
        return c.json(boundaryFailure(error), statusFor(error.code));
      }
    }

    const declared = Number(c.req.header("content-length"));
    if (!Number.isFinite(declared) || declared > maxRequestBytes) {
      const error = new BoundaryTransportError(
        "schema_invalid",
        "Boundary request size is missing or exceeds the limit",
        false,
        "00000000-0000-4000-8000-000000000000",
      );
      return c.json(boundaryFailure(error), statusFor(error.code));
    }

    const rawBody = new Uint8Array(await c.req.raw.arrayBuffer());

    let authenticated: AuthenticatedBoundaryRequest;
    try {
      authenticated = await authenticateBoundaryRequest({
        headers: { get: (name) => c.req.header(name) ?? null },
        rawBody,
        credentials,
        replayStore,
      });
    } catch (error) {
      if (error instanceof BoundaryTransportError) {
        deps.logger.warn(
          { code: error.code, correlationId: error.correlationId },
          "Boundary request rejected",
        );
        return c.json(boundaryFailure(error), statusFor(error.code));
      }
      throw error;
    }

    const { request } = authenticated;
    const handler = handlers[request.operation];
    if (handler === undefined) {
      const error = new BoundaryTransportError(
        "operation_failed",
        `Operation ${request.operation} has no registered handler`,
        false,
        request.correlationId,
      );
      return c.json(boundaryFailure(error), statusFor(error.code));
    }

    try {
      const result = await handler(request);
      return c.json(
        boundarySuccessSchema.parse({
          version: boundaryVersion,
          correlationId: request.correlationId,
          ok: true,
          result: result ?? null,
        }),
      );
    } catch (error) {
      deps.logger.error(
        {
          operation: request.operation,
          correlationId: request.correlationId,
          err:
            error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        "Boundary operation failed",
      );
      const failure = new BoundaryTransportError(
        "operation_failed",
        "Boundary operation failed",
        false,
        request.correlationId,
        { cause: error },
      );
      return c.json(boundaryFailure(failure), statusFor(failure.code));
    }
  });

  return app;
}
