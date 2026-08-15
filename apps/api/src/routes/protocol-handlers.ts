import type { BoundaryOperation, BoundaryRequest } from "@labpics/contracts";
import type {
  ClientRegistryPort,
  ConsentPort,
  ProtocolArtifactPort,
  SigningKeyPort,
  UnitOfWork,
} from "@labpics/domain";

export type BoundaryOperationHandler = (
  request: Extract<BoundaryRequest, { operation: BoundaryOperation }>,
) => Promise<unknown>;

export interface ProtocolHandlersDeps {
  readonly unitOfWork: UnitOfWork;
  readonly clientRegistry: ClientRegistryPort;
  readonly consent: ConsentPort;
  readonly signingKeys: SigningKeyPort;
  readonly artifacts: ProtocolArtifactPort;
}

export function createProtocolBoundaryHandlers(
  deps: ProtocolHandlersDeps,
): Partial<Record<BoundaryOperation, BoundaryOperationHandler>> {
  const { unitOfWork, clientRegistry, consent, signingKeys, artifacts } = deps;

  return {
    "client.get": async (req) => {
      if (req.operation !== "client.get") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) => clientRegistry.getClient(req.payload.clientId, ctx));
    },

    "consent.get": async (req) => {
      if (req.operation !== "consent.get") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        consent.getConsent(req.payload.subjectId, req.payload.clientId, ctx),
      );
    },

    "consent.upsert": async (req) => {
      if (req.operation !== "consent.upsert") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        consent.upsertConsent(
          req.payload.subjectId,
          req.payload.clientId,
          req.payload.scopes,
          new Date(),
          ctx,
        ),
      );
    },

    "consent.revoke": async (req) => {
      if (req.operation !== "consent.revoke") throw new Error("Invalid operation");
      await unitOfWork.run(async (ctx) =>
        consent.revokeConsent(req.payload.subjectId, req.payload.clientId, new Date(), ctx),
      );
      return null;
    },

    "key.list": async (req) => {
      if (req.operation !== "key.list") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) => signingKeys.listSigningKeys(ctx));
    },

    "artifact.get": async (req) => {
      if (req.operation !== "artifact.get") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        artifacts.getArtifact(
          req.payload.model as Parameters<typeof artifacts.getArtifact>[0],
          req.payload.artifactId,
          ctx,
        ),
      );
    },

    "artifact.put": async (req) => {
      if (req.operation !== "artifact.put") throw new Error("Invalid operation");
      // grantId/uid/userCode are oidc-provider payload fields, not separate
      // boundary parameters: lift them into indexed columns for lookups.
      const payload = req.payload.payload as Record<string, unknown>;
      const stringField = (name: string): string | undefined => {
        const value = payload[name];
        return typeof value === "string" && value.length > 0 ? value : undefined;
      };
      const options: {
        grantId?: string;
        expiresAt?: Date;
        uid?: string;
        userCode?: string;
      } = {};
      const grantId = stringField("grantId");
      if (grantId !== undefined) options.grantId = grantId;
      const uid = stringField("uid");
      if (uid !== undefined) options.uid = uid;
      const userCode = stringField("userCode");
      if (userCode !== undefined) options.userCode = userCode;
      if (req.payload.expiresAt !== undefined) options.expiresAt = new Date(req.payload.expiresAt);
      await unitOfWork.run(async (ctx) =>
        artifacts.putArtifact(
          req.payload.model as Parameters<typeof artifacts.putArtifact>[0],
          req.payload.artifactId,
          payload,
          options,
          ctx,
        ),
      );
      return null;
    },

    "artifact.consume": async (req) => {
      if (req.operation !== "artifact.consume") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        artifacts.consumeArtifact(
          req.payload.model as Parameters<typeof artifacts.consumeArtifact>[0],
          req.payload.artifactId,
          new Date(),
          ctx,
        ),
      );
    },

    "artifact.delete": async (req) => {
      if (req.operation !== "artifact.delete") throw new Error("Invalid operation");
      await unitOfWork.run(async (ctx) =>
        artifacts.destroyArtifact(
          req.payload.model as Parameters<typeof artifacts.destroyArtifact>[0],
          req.payload.artifactId,
          ctx,
        ),
      );
      return null;
    },

    "artifact.findByUid": async (req) => {
      if (req.operation !== "artifact.findByUid") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        artifacts.findArtifactByUid(
          req.payload.model as Parameters<typeof artifacts.findArtifactByUid>[0],
          req.payload.uid,
          ctx,
        ),
      );
    },

    "artifact.findByUserCode": async (req) => {
      if (req.operation !== "artifact.findByUserCode") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        artifacts.findArtifactByUserCode(
          req.payload.model as Parameters<typeof artifacts.findArtifactByUserCode>[0],
          req.payload.userCode,
          ctx,
        ),
      );
    },

    "artifact.revokeByGrantId": async (req) => {
      if (req.operation !== "artifact.revokeByGrantId") throw new Error("Invalid operation");
      await unitOfWork.run(async (ctx) =>
        artifacts.revokeArtifactsByGrantId(req.payload.grantId, ctx),
      );
      return null;
    },
  };
}
