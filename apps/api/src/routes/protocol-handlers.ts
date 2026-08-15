import { createHmac } from "node:crypto";
import type { BoundaryOperation, BoundaryRequest } from "@labpics/contracts";
import { BoundaryTransportError } from "@labpics/contracts/boundary-auth";
import {
  type ClientRegistryPort,
  type ConsentPort,
  PROTOCOL_ARTIFACT_MODELS,
  type ProtocolArtifactModel,
  type ProtocolArtifactPort,
  type SigningKeyPort,
  type UnitOfWork,
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
  readonly pairwiseSecret: string;
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
      const model = parseArtifactModel(req.payload.model, req.correlationId);
      return unitOfWork.run(async (ctx) =>
        artifacts.getArtifact(model, req.payload.artifactId, ctx),
      );
    },

    "artifact.put": async (req) => {
      if (req.operation !== "artifact.put") throw new Error("Invalid operation");
      const model = parseArtifactModel(req.payload.model, req.correlationId);
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
      if (req.payload.expiresAt !== undefined) {
        options.expiresAt = parseArtifactExpiry(req.payload.expiresAt, req.correlationId);
      }
      await unitOfWork.run(async (ctx) =>
        artifacts.putArtifact(model, req.payload.artifactId, payload, options, ctx),
      );
      return null;
    },

    "artifact.consume": async (req) => {
      if (req.operation !== "artifact.consume") throw new Error("Invalid operation");
      const model = parseArtifactModel(req.payload.model, req.correlationId);
      return unitOfWork.run(async (ctx) =>
        artifacts.consumeArtifact(model, req.payload.artifactId, new Date(), ctx),
      );
    },

    "artifact.delete": async (req) => {
      if (req.operation !== "artifact.delete") throw new Error("Invalid operation");
      const model = parseArtifactModel(req.payload.model, req.correlationId);
      await unitOfWork.run(async (ctx) =>
        artifacts.destroyArtifact(model, req.payload.artifactId, ctx),
      );
      return null;
    },

    "subject.pairwise": async (req) => {
      if (req.operation !== "subject.pairwise") throw new Error("Invalid operation");
      const { subjectId, sectorIdentifier, clientId } = req.payload;
      const sector = sectorIdentifier || clientId;
      const hmac = createHmac("sha256", deps.pairwiseSecret);
      hmac.update(subjectId);
      hmac.update(sector);
      return hmac.digest("hex");
    },

    "artifact.find_by_uid": async (req) => {
      if (req.operation !== "artifact.find_by_uid") throw new Error("Invalid operation");
      const model = parseArtifactModel(req.payload.model, req.correlationId);
      return unitOfWork.run(async (ctx) =>
        artifacts.findArtifactByUid(model, req.payload.uid, ctx),
      );
    },

    "artifact.find_by_user_code": async (req) => {
      if (req.operation !== "artifact.find_by_user_code") throw new Error("Invalid operation");
      const model = parseArtifactModel(req.payload.model, req.correlationId);
      return unitOfWork.run(async (ctx) =>
        artifacts.findArtifactByUserCode(model, req.payload.userCode, ctx),
      );
    },

    "artifact.revoke_by_grant_id": async (req) => {
      if (req.operation !== "artifact.revoke_by_grant_id") throw new Error("Invalid operation");
      return unitOfWork.run(async (ctx) =>
        artifacts.revokeArtifactsByGrantId(req.payload.grantId, new Date(), ctx),
      );
    },
  };
}

const ARTIFACT_MODEL_SET: ReadonlySet<string> = new Set(PROTOCOL_ARTIFACT_MODELS);

/** Rejects unknown artifact models before they reach Postgres as enum errors. */
function parseArtifactModel(model: string, correlationId: string): ProtocolArtifactModel {
  if (!ARTIFACT_MODEL_SET.has(model)) {
    throw new BoundaryTransportError(
      "schema_invalid",
      `Unknown artifact model "${model}"`,
      false,
      correlationId,
    );
  }
  return model as ProtocolArtifactModel;
}

/**
 * The boundary contract already enforces ISO-8601-with-offset *format*
 * (numeric epochs never reach here); this guards calendar validity, which the
 * format regex cannot: "2026-02-30T00:00:00Z" normalizes silently in
 * `new Date()` and "2026-99-99..." produces an Invalid Date.
 */
function parseArtifactExpiry(value: string, correlationId: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !isCalendarValid(value)) {
    throw new BoundaryTransportError(
      "schema_invalid",
      "expiresAt is not a calendar-valid ISO 8601 timestamp",
      false,
      correlationId,
    );
  }
  return date;
}

function isCalendarValid(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  return hour <= 23 && minute <= 59 && second <= 59;
}
