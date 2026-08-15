import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type BoundaryCredential,
  type BoundaryErrorCode,
  type BoundaryRequest,
  type BoundaryResponse,
  boundaryCredentialSchema,
  boundaryFailureSchema,
  boundaryRequestSchema,
  boundaryVersion,
} from "./protocol-boundary.ts";

/**
 * Shared API↔Protocol boundary authentication: HMAC-SHA256 over
 * `timestamp.nonce.body` with per-workload credentials, bounded clock skew
 * and one-time nonces. Both ends import this single implementation so the
 * wire contract cannot drift (ch03 invariant 5).
 */

export const BOUNDARY_AUTH_SCHEME = "Labpics-HMAC-SHA256";
export const BOUNDARY_MAX_CLOCK_SKEW_SECONDS = 30;

const AUTHORIZATION_PATTERN = new RegExp(
  `^${BOUNDARY_AUTH_SCHEME} ([A-Za-z0-9._~-]{1,128}):([A-Za-z0-9_-]{43})$`,
);
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const UNKNOWN_CORRELATION_ID = "00000000-0000-4000-8000-000000000000";

export class BoundaryTransportError extends Error {
  override readonly name = "BoundaryTransportError";
  readonly code: BoundaryErrorCode;
  readonly retryable: boolean;
  readonly correlationId: string;

  constructor(
    code: BoundaryErrorCode,
    message: string,
    retryable: boolean,
    correlationId: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
  }
}

export function signBoundaryPayload(
  secret: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array,
): string {
  const prefix = new TextEncoder().encode(`${timestamp}.${nonce}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  return createHmac("sha256", secret).update(signed).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function parseBoundaryCredentials(
  raw: readonly unknown[] | undefined,
): readonly BoundaryCredential[] {
  if (raw === undefined) return [];
  const credentials = raw.map((value) => boundaryCredentialSchema.parse(value));
  const ids = credentials.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("Boundary credential ids must be unique");
  return credentials;
}

export interface ReplayStore {
  /** Atomically records the key; returns false when it was already seen. */
  consume(key: string, expiresAt: number): Promise<boolean>;
}

/** Process-local replay store; sufficient while the API runs as one process. */
export class MemoryReplayStore implements ReplayStore {
  readonly #seen = new Map<string, number>();

  consume(key: string, expiresAt: number): Promise<boolean> {
    const now = Date.now();
    for (const [candidate, expiry] of this.#seen) {
      if (expiry <= now) this.#seen.delete(candidate);
    }
    if (this.#seen.has(key)) return Promise.resolve(false);
    this.#seen.set(key, expiresAt);
    return Promise.resolve(true);
  }
}

export interface BoundaryAuthHeaders {
  get(name: string): string | null | undefined;
}

export interface AuthenticatedBoundaryRequest {
  readonly credential: BoundaryCredential;
  readonly request: BoundaryRequest;
}

export async function authenticateBoundaryRequest(input: {
  readonly headers: BoundaryAuthHeaders;
  readonly rawBody: Uint8Array;
  readonly credentials: readonly BoundaryCredential[];
  readonly replayStore: ReplayStore;
  readonly now?: number;
}): Promise<AuthenticatedBoundaryRequest> {
  const authorization = input.headers.get("authorization") ?? undefined;
  const timestamp = input.headers.get("x-labpics-timestamp") ?? undefined;
  const nonce = input.headers.get("x-labpics-nonce") ?? undefined;
  const version = input.headers.get("x-labpics-boundary-version") ?? undefined;
  if (version !== boundaryVersion) {
    throw new BoundaryTransportError(
      "version_unsupported",
      "Unsupported boundary version",
      false,
      UNKNOWN_CORRELATION_ID,
    );
  }
  if (authorization === undefined || timestamp === undefined || nonce === undefined) {
    throw new BoundaryTransportError(
      "authentication_failed",
      "Boundary authentication required",
      false,
      UNKNOWN_CORRELATION_ID,
    );
  }

  const denied = (): BoundaryTransportError =>
    new BoundaryTransportError(
      "authentication_failed",
      "Invalid boundary authentication",
      false,
      UNKNOWN_CORRELATION_ID,
    );

  const match = AUTHORIZATION_PATTERN.exec(authorization);
  if (match === null || match[1] === undefined || match[2] === undefined) throw denied();
  const credentialId = match[1];
  const suppliedSignature = match[2];
  const credential = input.credentials.find(({ id }) => id === credentialId);
  if (credential === undefined) throw denied();

  const timestampSeconds = Number(timestamp);
  const now = input.now ?? Date.now();
  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(Math.floor(now / 1000) - timestampSeconds) > BOUNDARY_MAX_CLOCK_SKEW_SECONDS
  ) {
    throw new BoundaryTransportError(
      "authentication_failed",
      "Expired boundary authentication",
      false,
      UNKNOWN_CORRELATION_ID,
    );
  }
  if (!NONCE_PATTERN.test(nonce)) throw denied();
  if (
    !constantTimeEqual(
      suppliedSignature,
      signBoundaryPayload(credential.secret, timestamp, nonce, input.rawBody),
    )
  ) {
    throw denied();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(input.rawBody));
  } catch (error) {
    throw new BoundaryTransportError(
      "schema_invalid",
      "Boundary request is not valid JSON",
      false,
      UNKNOWN_CORRELATION_ID,
      { cause: error },
    );
  }
  const parsed = boundaryRequestSchema.safeParse(decoded);
  if (!parsed.success) {
    const record =
      typeof decoded === "object" && decoded !== null ? (decoded as Record<string, unknown>) : {};
    const correlationId =
      typeof record.correlationId === "string" ? record.correlationId : UNKNOWN_CORRELATION_ID;
    const code: BoundaryErrorCode =
      "version" in record && record.version !== boundaryVersion
        ? "version_unsupported"
        : "schema_invalid";
    throw new BoundaryTransportError(code, "Invalid boundary request", false, correlationId);
  }
  if (!credential.operations.includes(parsed.data.operation)) {
    throw new BoundaryTransportError(
      "authorization_denied",
      "Operation is not authorized",
      false,
      parsed.data.correlationId,
    );
  }
  const consumed = await input.replayStore.consume(
    `${credential.id}:${nonce}`,
    now + BOUNDARY_MAX_CLOCK_SKEW_SECONDS * 2_000,
  );
  if (!consumed) {
    throw new BoundaryTransportError(
      "replay_detected",
      "Boundary request replay detected",
      false,
      parsed.data.correlationId,
    );
  }
  return { credential, request: parsed.data };
}

export function boundaryFailure(error: BoundaryTransportError): BoundaryResponse {
  return boundaryFailureSchema.parse({
    version: boundaryVersion,
    correlationId: error.correlationId,
    ok: false,
    error: { code: error.code, message: error.message, retryable: error.retryable },
  });
}
