import { describe, expect, it } from "bun:test";
import type { BoundaryRequest } from "@labpics/contracts";
import { BoundaryTransportError } from "@labpics/contracts/boundary-auth";
import type {
  ClientRegistryPort,
  ConsentPort,
  ProtocolArtifactPort,
  ProtocolArtifactPutOptions,
  SigningKeyPort,
  UnitOfWork,
} from "@labpics/domain";
import { createProtocolBoundaryHandlers } from "./protocol-handlers";

const CORRELATION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

const unitOfWork: UnitOfWork = {
  run: (work) => work({ transactionId: "tx-test" }),
};

function makeHandlers(putCalls: ProtocolArtifactPutOptions[] = []) {
  const artifacts: ProtocolArtifactPort = {
    getArtifact: async () => null,
    putArtifact: async (_model, _id, _payload, options) => {
      putCalls.push(options);
    },
    findArtifactByUid: async () => null,
    findArtifactByUserCode: async () => null,
    consumeArtifact: async () => null,
    destroyArtifact: async () => undefined,
    revokeArtifactsByGrantId: async () => 0,
    cleanupExpiredArtifacts: async () => 0,
  };
  return createProtocolBoundaryHandlers({
    unitOfWork,
    clientRegistry: {} as ClientRegistryPort,
    consent: {} as ConsentPort,
    signingKeys: {} as SigningKeyPort,
    artifacts,
  });
}

function artifactPut(payload: Record<string, unknown>): BoundaryRequest {
  return {
    version: "1",
    correlationId: CORRELATION_ID,
    operation: "artifact.put",
    payload: {
      model: "AccessToken",
      artifactId: "artifact-1",
      payload: {},
      ...payload,
    },
  } as BoundaryRequest;
}

describe("protocol boundary handler validation", () => {
  it("rejects an unknown artifact model with schema_invalid before any port call", async () => {
    const handlers = makeHandlers();
    for (const operation of [
      "artifact.get",
      "artifact.put",
      "artifact.consume",
      "artifact.delete",
    ] as const) {
      const request = {
        version: "1",
        correlationId: CORRELATION_ID,
        operation,
        payload: { model: "NotAModel", artifactId: "artifact-1", payload: {} },
      } as BoundaryRequest;
      const handler = handlers[operation];
      if (handler === undefined) throw new Error(`missing handler for ${operation}`);
      const error = await handler(request).then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(BoundaryTransportError);
      expect((error as BoundaryTransportError).code).toBe("schema_invalid");
    }
  });

  it("accepts every declared artifact model", async () => {
    const handlers = makeHandlers();
    const handler = handlers["artifact.get"];
    if (handler === undefined) throw new Error("missing handler");
    const request = {
      version: "1",
      correlationId: CORRELATION_ID,
      operation: "artifact.get",
      payload: { model: "Grant", artifactId: "artifact-1" },
    } as BoundaryRequest;
    expect(await handler(request)).toBeNull();
  });

  it("rejects a format-valid but calendar-invalid expiresAt", async () => {
    const handlers = makeHandlers();
    const handler = handlers["artifact.put"];
    if (handler === undefined) throw new Error("missing handler");
    for (const expiresAt of [
      "2026-02-30T00:00:00.000Z", // February 30 normalizes silently in Date
      "2026-13-01T00:00:00.000Z", // month 13
      "2026-01-01T24:00:00.000Z", // hour 24
    ]) {
      const error = await handler(artifactPut({ expiresAt })).then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(BoundaryTransportError);
      expect((error as BoundaryTransportError).code).toBe("schema_invalid");
    }
  });

  it("accepts a calendar-valid ISO expiresAt with offset and stores the parsed date", async () => {
    const putCalls: ProtocolArtifactPutOptions[] = [];
    const handlers = makeHandlers(putCalls);
    const handler = handlers["artifact.put"];
    if (handler === undefined) throw new Error("missing handler");
    await handler(artifactPut({ expiresAt: "2026-08-15T12:30:00.000+03:00" }));
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.expiresAt?.toISOString()).toBe("2026-08-15T09:30:00.000Z");
  });
});
