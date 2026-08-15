import { randomBytes } from "node:crypto";
import {
  type BoundaryOperation,
  type BoundaryRequest,
  boundaryRequestSchema,
  boundaryResponseSchema,
  boundarySuccessSchema,
  boundaryVersion,
  idempotentBoundaryReads,
} from "@labpics/contracts";
import {
  BOUNDARY_AUTH_SCHEME,
  BoundaryTransportError,
  parseBoundaryCredentials,
  signBoundaryPayload,
} from "@labpics/contracts/boundary-auth";
import type { Logger } from "./lib/logger.ts";

export { BoundaryTransportError };

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

export interface BoundaryClient {
  request(request: BoundaryRequest, signal?: AbortSignal): Promise<unknown>;
}

export interface BoundaryClientOptions {
  readonly credentials: readonly unknown[] | undefined;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly responseLimitBytes?: number;
  readonly logger: Logger;
  readonly fetch?: typeof globalThis.fetch;
}

function retryDelay(attempt: number): number {
  return Math.min(25 * 2 ** attempt, 200);
}

async function readLimited(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new BoundaryTransportError(
      "response_too_large",
      "Boundary response exceeded size limit",
      false,
      "unknown",
    );
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    if (signal.aborted) throw signal.reason;
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BoundaryTransportError(
        "response_too_large",
        "Boundary response exceeded size limit",
        false,
        "unknown",
      );
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Authenticated boundary client used by the Protocol process to reach the API.
 * Deadlines, cancellation, response-size limits and bounded retries live here;
 * only explicitly idempotent reads are ever retried (ch03 invariant 5).
 */
export function createBoundaryClient(options: BoundaryClientOptions): BoundaryClient {
  const credentials = parseBoundaryCredentials(options.credentials);
  if (credentials.length === 0) {
    // Fail-closed stub: without a workload credential every boundary call is a
    // typed authentication failure, never fabricated data (ch03 Must NOT Do).
    return {
      request(input) {
        const request = boundaryRequestSchema.parse(input);
        return Promise.reject(
          new BoundaryTransportError(
            "authentication_failed",
            "Boundary credentials are not configured",
            false,
            request.correlationId,
          ),
        );
      },
    };
  }
  if (credentials.length !== 1 || credentials[0] === undefined) {
    throw new Error("Protocol boundary client requires exactly one credential");
  }
  const credential = credentials[0];
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.pathname !== "/" || baseUrl.search !== "" || baseUrl.hash !== "") {
    throw new Error("Boundary base URL must be an origin");
  }
  const limit = options.responseLimitBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return {
    async request(input, callerSignal) {
      const request = boundaryRequestSchema.parse(input);
      if (!credential.operations.includes(request.operation)) {
        throw new BoundaryTransportError(
          "authorization_denied",
          "Client credential does not authorize operation",
          false,
          request.correlationId,
        );
      }
      const body = new TextEncoder().encode(JSON.stringify(request));
      const retries = idempotentBoundaryReads.has(request.operation) ? options.maxRetries : 0;
      for (let attempt = 0; ; attempt += 1) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomBytes(24).toString("base64url");
        const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
        const signal =
          callerSignal === undefined
            ? timeoutSignal
            : AbortSignal.any([callerSignal, timeoutSignal]);
        try {
          const response = await fetchImpl(new URL("/internal/protocol/v1", baseUrl), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `${BOUNDARY_AUTH_SCHEME} ${credential.id}:${signBoundaryPayload(credential.secret, timestamp, nonce, body)}`,
              "x-labpics-boundary-version": boundaryVersion,
              "x-labpics-timestamp": timestamp,
              "x-labpics-nonce": nonce,
              "x-correlation-id": request.correlationId,
            },
            body,
            signal,
          });
          const raw = await readLimited(response, limit, signal);
          let decoded: unknown;
          try {
            decoded = JSON.parse(new TextDecoder().decode(raw));
          } catch (error) {
            throw new BoundaryTransportError(
              "operation_failed",
              "Boundary returned invalid JSON",
              false,
              request.correlationId,
              { cause: error },
            );
          }
          const parsed = boundaryResponseSchema.safeParse(decoded);
          if (!parsed.success || parsed.data.correlationId !== request.correlationId) {
            throw new BoundaryTransportError(
              "schema_invalid",
              "Boundary returned an invalid response",
              false,
              request.correlationId,
            );
          }
          if (!parsed.data.ok) {
            throw new BoundaryTransportError(
              parsed.data.error.code,
              parsed.data.error.message,
              parsed.data.error.retryable,
              request.correlationId,
            );
          }
          if (!response.ok) {
            throw new BoundaryTransportError(
              "operation_failed",
              "Boundary status and response disagree",
              false,
              request.correlationId,
            );
          }
          return boundarySuccessSchema.parse(parsed.data).result;
        } catch (error) {
          const cancelled = callerSignal?.aborted === true;
          const timedOut = error instanceof DOMException && error.name === "TimeoutError";
          const normalized =
            error instanceof BoundaryTransportError
              ? new BoundaryTransportError(
                  error.code,
                  error.message,
                  error.retryable,
                  request.correlationId,
                  {
                    cause: error.cause,
                  },
                )
              : new BoundaryTransportError(
                  cancelled ? "cancelled" : timedOut ? "deadline_exceeded" : "upstream_unavailable",
                  cancelled
                    ? "Boundary request cancelled"
                    : timedOut
                      ? "Boundary deadline exceeded"
                      : "Boundary unavailable",
                  !cancelled,
                  request.correlationId,
                  { cause: error },
                );
          const mayRetry =
            attempt < retries &&
            normalized.code !== "cancelled" &&
            (normalized.code === "upstream_unavailable" ||
              normalized.code === "deadline_exceeded" ||
              normalized.retryable);
          if (!mayRetry) throw normalized;
          options.logger.warn(
            {
              operation: request.operation,
              correlationId: request.correlationId,
              attempt: attempt + 1,
              code: normalized.code,
            },
            "Retrying idempotent boundary request",
          );
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, retryDelay(attempt));
            callerSignal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(callerSignal.reason);
              },
              { once: true },
            );
          });
        }
      }
    },
  };
}

export function isRetryableOperation(operation: BoundaryOperation): boolean {
  return idempotentBoundaryReads.has(operation);
}
