import { describe, expect, it } from "bun:test";
import { BOUNDARY_AUTH_SCHEME, signBoundaryPayload } from "@labpics/contracts/boundary-auth";
import { Hono } from "hono";
import { internalProtocolRoutes } from "./internal-protocol";

const SECRET = "test-only-not-a-secret-".padEnd(48, "x");
const CREDENTIALS = [
  { id: "protocol-workload", secret: SECRET, operations: ["subject.get", "session.resolve"] },
];
const CORRELATION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

const silentLogger = {
  warn: () => undefined,
  error: () => undefined,
  info: () => undefined,
  debug: () => undefined,
} as never;

function makeApp(overrides: Partial<Parameters<typeof internalProtocolRoutes>[0]> = {}): Hono {
  const app = new Hono();
  app.route(
    "/",
    internalProtocolRoutes({
      logger: silentLogger,
      boundaryCredentials: CREDENTIALS,
      handlers: {
        "subject.get": async () => ({ id: "user-1", state: "active" }),
      },
      ...overrides,
    }),
  );
  return app;
}

interface SignedRequestOptions {
  readonly operation?: string;
  readonly payload?: Record<string, unknown>;
  readonly secret?: string;
  readonly credentialId?: string;
  readonly nonce?: string;
  readonly timestamp?: string;
  readonly version?: string;
  readonly extraHeaders?: Record<string, string>;
  readonly bodyOverride?: string;
}

function signedRequest(options: SignedRequestOptions = {}): Request {
  const body =
    options.bodyOverride ??
    JSON.stringify({
      version: options.version ?? "1",
      correlationId: CORRELATION_ID,
      operation: options.operation ?? "subject.get",
      payload: options.payload ?? { subjectId: "user-1" },
    });
  const bytes = new TextEncoder().encode(body);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = options.nonce ?? crypto.randomUUID().replaceAll("-", "");
  const sig = signBoundaryPayload(options.secret ?? SECRET, timestamp, nonce, bytes);
  return new Request("http://internal.test/internal/protocol/v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes.byteLength),
      authorization: `${BOUNDARY_AUTH_SCHEME} ${options.credentialId ?? "protocol-workload"}:${sig}`,
      "x-labpics-boundary-version": "1",
      "x-labpics-timestamp": timestamp,
      "x-labpics-nonce": nonce,
      ...options.extraHeaders,
    },
    body,
  });
}

describe("Internal protocol boundary endpoint", () => {
  it("accepts an authenticated, authorized request and returns the typed result", async () => {
    const response = await makeApp().request(signedRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      correlationId: string;
      result: { id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.correlationId).toBe(CORRELATION_ID);
    expect(body.result.id).toBe("user-1");
  });

  it("rejects a request without authentication headers", async () => {
    const response = await makeApp().request(
      new Request("http://internal.test/internal/protocol/v1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
          "x-labpics-boundary-version": "1",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("authentication_failed");
  });

  it("rejects a signature from the wrong secret", async () => {
    const response = await makeApp().request(
      signedRequest({ secret: "wrong-secret-with-at-least-32-characters!" }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an operation outside the credential grant", async () => {
    const response = await makeApp().request(
      signedRequest({ operation: "subject.deactivate", payload: { subjectId: "user-1" } }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("authorization_denied");
  });

  it("rejects a replayed nonce with 409", async () => {
    const app = makeApp();
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const first = await app.request(signedRequest({ nonce }));
    expect(first.status).toBe(200);
    const second = await app.request(signedRequest({ nonce }));
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("replay_detected");
  });

  it("rejects an unsupported schema version", async () => {
    const response = await makeApp().request(
      signedRequest({ extraHeaders: { "x-labpics-boundary-version": "999" } }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("version_unsupported");
  });

  it("rejects a schema-invalid signed body", async () => {
    const response = await makeApp().request(
      signedRequest({
        bodyOverride: JSON.stringify({
          version: "1",
          correlationId: CORRELATION_ID,
          operation: "subject.get",
          payload: { subjectId: "user-1", extra: "field" },
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("schema_invalid");
  });

  it("rejects caller-supplied identity and forwarding headers before auth", async () => {
    for (const header of [
      "x-forwarded-host",
      "x-forwarded-for",
      "forwarded",
      "x-real-ip",
      "x-labpics-subject",
      "x-labpics-workload",
    ]) {
      const response = await makeApp().request(
        signedRequest({ extraHeaders: { [header]: "attacker" } }),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("schema_invalid");
    }
  });

  it("fails closed when no boundary credentials are configured", async () => {
    const response = await makeApp({ boundaryCredentials: undefined }).request(signedRequest());
    expect(response.status).toBe(401);
  });

  it("rejects an authenticated request whose operation has no handler", async () => {
    const response = await makeApp().request(
      signedRequest({ operation: "session.resolve", payload: { credential: "cookie" } }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("operation_failed");
  });

  it("normalizes handler exceptions without leaking internals", async () => {
    const response = await makeApp({
      handlers: {
        "subject.get": async () => {
          throw new Error("secret database detail");
        },
      },
    }).request(signedRequest());
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("operation_failed");
    expect(body.error.message).not.toContain("secret database detail");
  });

  it("rejects an expired timestamp", async () => {
    const response = await makeApp().request(
      signedRequest({ timestamp: String(Math.floor(Date.now() / 1000) - 300) }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects oversized requests by declared content-length", async () => {
    const response = await makeApp({ maxRequestBytes: 8 }).request(signedRequest());
    expect(response.status).toBe(400);
  });
});
