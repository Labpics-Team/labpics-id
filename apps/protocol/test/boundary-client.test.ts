import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  type BoundaryOperation,
  type BoundaryRequest,
  boundaryFailureSchema,
  boundarySuccessSchema,
  boundaryVersion,
  idempotentBoundaryReads,
} from "@labpics/contracts";
import { BoundaryTransportError } from "@labpics/contracts/boundary-auth";
import { type BoundaryClientOptions, createBoundaryClient } from "../src/boundary.ts";
import { createLogger } from "../src/lib/logger.ts";

const SECRET = "test-only-not-a-secret-".padEnd(48, "x");
const credential = {
  id: "protocol-workload",
  secret: SECRET,
  operations: ["subject.get", "session.resolve", "artifact.put"],
};

function makeRequest(operation: BoundaryOperation = "subject.get"): BoundaryRequest {
  return {
    version: boundaryVersion,
    correlationId: randomUUID(),
    operation,
    payload:
      operation === "artifact.put"
        ? { model: "Grant", artifactId: "a1", payload: { ok: true } }
        : { subjectId: "s1" },
  } as BoundaryRequest;
}

function baseOptions(overrides: Partial<BoundaryClientOptions> = {}): BoundaryClientOptions {
  return {
    credentials: [credential],
    baseUrl: "http://127.0.0.1:9999",
    timeoutMs: 500,
    maxRetries: 2,
    logger: createLogger("silent"),
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Boundary client transport", () => {
  it("returns the parsed result on a successful response", async () => {
    const request = makeRequest();
    const client = createBoundaryClient(
      baseOptions({
        fetch: async (_url, init) => {
          assert.equal(init?.method, "POST");
          const body = JSON.parse(new TextDecoder().decode(init?.body as Uint8Array));
          assert.equal(body.correlationId, request.correlationId);
          return jsonResponse(
            boundarySuccessSchema.parse({
              version: boundaryVersion,
              correlationId: request.correlationId,
              ok: true,
              result: { found: true },
            }),
          );
        },
      }),
    );
    const result = await client.request(request);
    assert.deepEqual(result, { found: true });
  });

  it("propagates typed failures from the server without retrying writes", async () => {
    let calls = 0;
    const request = makeRequest("artifact.put");
    const client = createBoundaryClient(
      baseOptions({
        fetch: async () => {
          calls += 1;
          return jsonResponse(
            boundaryFailureSchema.parse({
              version: boundaryVersion,
              correlationId: request.correlationId,
              ok: false,
              error: { code: "operation_failed", message: "store unavailable", retryable: false },
            }),
            { status: 500 },
          );
        },
      }),
    );
    await assert.rejects(
      () => client.request(request),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "operation_failed");
        assert.equal(err.retryable, false);
        return true;
      },
    );
    assert.equal(calls, 1, "non-idempotent writes must not be retried");
  });

  it("retries idempotent reads on upstream_unavailable up to maxRetries", async () => {
    let calls = 0;
    const request = makeRequest("subject.get");
    assert.ok(idempotentBoundaryReads.has(request.operation));
    const client = createBoundaryClient(
      baseOptions({
        maxRetries: 2,
        fetch: async () => {
          calls += 1;
          throw new Error("connection reset");
        },
      }),
    );
    await assert.rejects(
      () => client.request(request),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "upstream_unavailable");
        return true;
      },
    );
    assert.equal(calls, 3, "initial + 2 retries for idempotent read");
  });

  it("does not retry cancelled requests", async () => {
    let calls = 0;
    const ac = new AbortController();
    const client = createBoundaryClient(
      baseOptions({
        fetch: async (_url, init) => {
          calls += 1;
          await new Promise<void>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          });
          throw new Error("should not reach");
        },
      }),
    );
    const promise = client.request(makeRequest(), ac.signal);
    ac.abort(new DOMException("cancelled by caller", "AbortError"));
    await assert.rejects(promise, (err: unknown) => {
      assert.ok(err instanceof BoundaryTransportError);
      assert.equal(err.code, "cancelled");
      return true;
    });
    assert.equal(calls, 1);
  });

  it("normalizes deadline exceeded into a typed error", async () => {
    const client = createBoundaryClient(
      baseOptions({
        timeoutMs: 20,
        fetch: async (_url, init) => {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, 5_000);
            init?.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                reject(init.signal?.reason);
              },
              { once: true },
            );
          });
          throw new Error("unreachable");
        },
      }),
    );
    await assert.rejects(
      () => client.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "deadline_exceeded");
        return true;
      },
    );
  });

  it("rejects responses that exceed the size limit", async () => {
    const big = "x".repeat(2_000_000);
    const client = createBoundaryClient(
      baseOptions({
        responseLimitBytes: 1_024,
        fetch: async () =>
          new Response(big, {
            status: 200,
            headers: { "content-length": String(big.length) },
          }),
      }),
    );
    await assert.rejects(
      () => client.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "response_too_large");
        return true;
      },
    );
  });

  it("fails closed when no credentials are configured", async () => {
    const client = createBoundaryClient(baseOptions({ credentials: undefined }));
    await assert.rejects(
      () => client.request(makeRequest()),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "authentication_failed");
        assert.match(err.message, /not configured/i);
        return true;
      },
    );
  });

  it("rejects operations not granted to the workload credential", async () => {
    const client = createBoundaryClient(baseOptions());
    await assert.rejects(
      () =>
        client.request({
          version: boundaryVersion,
          correlationId: randomUUID(),
          operation: "audit.append",
          payload: { eventType: "e", payload: {}, occurredAt: new Date().toISOString() },
        }),
      (err: unknown) => {
        assert.ok(err instanceof BoundaryTransportError);
        assert.equal(err.code, "authorization_denied");
        return true;
      },
    );
  });

  it("rejects a non-origin base URL", () => {
    assert.throws(
      () => createBoundaryClient(baseOptions({ baseUrl: "http://127.0.0.1:9999/api" })),
      /origin/,
    );
  });
});
