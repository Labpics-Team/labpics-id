import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { type BoundaryCredential, boundaryVersion } from "@labpics/contracts";
import {
  authenticateBoundaryRequest,
  BOUNDARY_AUTH_SCHEME,
  BoundaryTransportError,
  boundaryFailure,
  MemoryReplayStore,
  parseBoundaryCredentials,
  signBoundaryPayload,
} from "@labpics/contracts/boundary-auth";

const SECRET = "test-only-not-a-secret-".padEnd(48, "x");

const credential: BoundaryCredential = {
  id: "protocol-workload",
  secret: SECRET,
  operations: ["subject.get", "session.resolve"],
};

function makeRequestBody(
  operation = "subject.get",
  overrides: Record<string, unknown> = {},
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      version: boundaryVersion,
      correlationId: randomUUID(),
      operation,
      payload: { subjectId: "subject-1" },
      ...overrides,
    }),
  );
}

function signedHeaders(body: Uint8Array, overrides: Record<string, string | undefined> = {}) {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? randomBytes(24).toString("base64url");
  const secret = overrides.secret ?? SECRET;
  const credentialId = overrides.credentialId ?? credential.id;
  const map = new Map<string, string>([
    [
      "authorization",
      `${BOUNDARY_AUTH_SCHEME} ${credentialId}:${signBoundaryPayload(secret, timestamp, nonce, body)}`,
    ],
    ["x-labpics-boundary-version", overrides.version ?? boundaryVersion],
    ["x-labpics-timestamp", timestamp],
    ["x-labpics-nonce", nonce],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith("x-") || key === "authorization") {
      if (value === undefined) map.delete(key);
      else map.set(key, value);
    }
  }
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<BoundaryTransportError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof BoundaryTransportError,
      `expected BoundaryTransportError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected rejection with ${code}`);
}

describe("Boundary authentication", () => {
  it("accepts a correctly signed, authorized, fresh request", async () => {
    const body = makeRequestBody();
    const result = await authenticateBoundaryRequest({
      headers: signedHeaders(body),
      rawBody: body,
      credentials: [credential],
      replayStore: new MemoryReplayStore(),
    });
    assert.equal(result.credential.id, credential.id);
    assert.equal(result.request.operation, "subject.get");
  });

  it("rejects a missing authorization header", async () => {
    const body = makeRequestBody();
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { authorization: undefined }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
  });

  it("rejects an unknown credential id", async () => {
    const body = makeRequestBody();
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { credentialId: "unknown-workload" }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
  });

  it("rejects a signature made with the wrong secret", async () => {
    const body = makeRequestBody();
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { secret: "f".repeat(48) }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
  });

  it("rejects a signature over a different body (tamper detection)", async () => {
    const signedBody = makeRequestBody();
    const tamperedBody = makeRequestBody("subject.get", { payload: { subjectId: "attacker" } });
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(signedBody),
        rawBody: tamperedBody,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
  });

  it("rejects an expired timestamp beyond clock skew", async () => {
    const body = makeRequestBody();
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { timestamp: stale }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
  });

  it("rejects an unsupported boundary version", async () => {
    const body = makeRequestBody();
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { "x-labpics-boundary-version": "999" }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "version_unsupported",
    );
  });

  it("rejects an unsupported version inside a signed body", async () => {
    const body = makeRequestBody("subject.get", { version: "999" });
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "version_unsupported",
    );
  });

  it("rejects a schema-invalid signed body", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ version: boundaryVersion, junk: true }));
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "schema_invalid",
    );
  });

  it("rejects unparseable JSON with a typed error", async () => {
    const body = new TextEncoder().encode("{broken");
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "schema_invalid",
    );
  });

  it("denies operations outside the credential grant (least privilege)", async () => {
    const body = makeRequestBody("subject.deactivate");
    await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authorization_denied",
    );
  });

  it("detects replay of the same nonce", async () => {
    const body = makeRequestBody();
    const headers = signedHeaders(body);
    const replayStore = new MemoryReplayStore();
    await authenticateBoundaryRequest({
      headers,
      rawBody: body,
      credentials: [credential],
      replayStore,
    });
    await expectCode(
      authenticateBoundaryRequest({
        headers,
        rawBody: body,
        credentials: [credential],
        replayStore,
      }),
      "replay_detected",
    );
  });

  it("scopes replay keys per credential", async () => {
    const second: BoundaryCredential = { ...credential, id: "second-workload" };
    const body = makeRequestBody();
    const nonce = randomBytes(24).toString("base64url");
    const replayStore = new MemoryReplayStore();
    await authenticateBoundaryRequest({
      headers: signedHeaders(body, { nonce }),
      rawBody: body,
      credentials: [credential, second],
      replayStore,
    });
    // Same nonce under a different credential is not a replay of the first.
    await authenticateBoundaryRequest({
      headers: signedHeaders(body, { nonce, credentialId: second.id }),
      rawBody: body,
      credentials: [credential, second],
      replayStore,
    });
  });

  it("never echoes secret material in errors or failure envelopes", async () => {
    const body = makeRequestBody();
    const error = await expectCode(
      authenticateBoundaryRequest({
        headers: signedHeaders(body, { secret: "f".repeat(48) }),
        rawBody: body,
        credentials: [credential],
        replayStore: new MemoryReplayStore(),
      }),
      "authentication_failed",
    );
    const failure = JSON.stringify(boundaryFailure(error));
    assert.ok(!failure.includes(SECRET));
    assert.ok(!error.message.includes(SECRET));
  });
});

describe("Boundary credential parsing", () => {
  it("rejects duplicate credential ids", () => {
    assert.throws(() => parseBoundaryCredentials([credential, { ...credential }]), /unique/);
  });

  it("rejects secrets below the minimum length", () => {
    assert.throws(() =>
      parseBoundaryCredentials([{ id: "short", secret: "too-short", operations: ["subject.get"] }]),
    );
  });

  it("rejects credentials without operations", () => {
    assert.throws(() =>
      parseBoundaryCredentials([{ id: "no-ops", secret: SECRET, operations: [] }]),
    );
  });
});
