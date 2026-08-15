import type Provider from "oidc-provider";
import type { BoundaryClient } from "./boundary.ts";

type AdapterModel =
  | "AccessToken"
  | "AuthorizationCode"
  | "RefreshToken"
  | "DeviceCode"
  | "ClientCredentials"
  | "InitialAccessToken"
  | "RegistrationAccessToken"
  | "Interaction"
  | "ReplayDetection"
  | "Session"
  | "Grant"
  | "BackchannelAuthenticationRequest"
  | "PushedAuthorizationRequest"
  | "PreAuthorizedCode"
  | "Client";

interface BoundaryAdapterPayload {
  readonly [key: string]: unknown;
}

export class BoundaryAdapterNotWiredError extends Error {
  constructor() {
    super("Boundary adapter not wired");
    this.name = "BoundaryAdapterNotWiredError";
  }
}

export function createBoundaryAdapter(boundaryClient: BoundaryClient): typeof Provider.Adapter {
  return class BoundaryAdapter {
    constructor(private readonly model: AdapterModel) {}

    async upsert(id: string, payload: BoundaryAdapterPayload, expiresIn: number): Promise<void> {
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      await boundaryClient.request({
        operation: "artifact.put",
        model: this.model,
        id,
        payload,
        expiresAt,
        grantId: typeof payload.grantId === "string" ? payload.grantId : undefined,
        subjectId: typeof payload.accountId === "string" ? payload.accountId : undefined,
        clientId: typeof payload.clientId === "string" ? payload.clientId : undefined,
        uid: typeof payload.uid === "string" ? payload.uid : undefined,
        userCode: typeof payload.userCode === "string" ? payload.userCode : undefined,
      });
    }

    async find(id: string): Promise<BoundaryAdapterPayload | undefined> {
      const result = await boundaryClient.request({
        operation: "artifact.get",
        model: this.model,
        id,
      });
      if (!result || typeof result !== "object") return undefined;
      const record = result as { payload?: unknown; consumedAt?: string | null };
      const payload = record.payload;
      if (!payload || typeof payload !== "object") return undefined;
      if (record.consumedAt) {
        return { ...(payload as object), consumed: new Date(record.consumedAt).getTime() };
      }
      return payload as BoundaryAdapterPayload;
    }

    async findByUid(uid: string): Promise<BoundaryAdapterPayload | undefined> {
      const result = await boundaryClient.request({
        operation: "artifact.findByUid",
        model: this.model,
        uid,
      });
      if (!result || typeof result !== "object") return undefined;
      const record = result as { id?: string; payload?: unknown };
      const payload = record.payload;
      if (!payload || typeof payload !== "object") return undefined;
      return payload as BoundaryAdapterPayload;
    }

    async findByUserCode(userCode: string): Promise<BoundaryAdapterPayload | undefined> {
      const result = await boundaryClient.request({
        operation: "artifact.findByUserCode",
        model: this.model,
        userCode,
      });
      if (!result || typeof result !== "object") return undefined;
      const record = result as { id?: string; payload?: unknown };
      const payload = record.payload;
      if (!payload || typeof payload !== "object") return undefined;
      return payload as BoundaryAdapterPayload;
    }

    async consume(id: string): Promise<void> {
      await boundaryClient.request({
        operation: "artifact.consume",
        model: this.model,
        id,
      });
    }

    async destroy(id: string): Promise<void> {
      await boundaryClient.request({
        operation: "artifact.delete",
        model: this.model,
        id,
      });
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await boundaryClient.request({
        operation: "artifact.revokeByGrantId",
        grantId,
      });
    }
  };
}