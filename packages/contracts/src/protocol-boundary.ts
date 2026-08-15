import { z } from "zod";

export const boundaryVersion = "1" as const;

const id = z.string().min(1).max(255);
const timestamp = z.string().datetime({ offset: true });
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const boundaryOperationSchema = z.enum([
  "subject.get",
  "subject.pairwise",
  "session.resolve",
  "session.reauthenticate",
  "subject.deactivate",
  "session.revoke",
  "client.get",
  "consent.get",
  "consent.upsert",
  "consent.revoke",
  "key.list",
  "artifact.get",
  "artifact.put",
  "artifact.consume",
  "artifact.delete",
  "artifact.find_by_uid",
  "artifact.find_by_user_code",
  "artifact.revoke_by_grant_id",
  "audit.append",
  "outbox.enqueue",
]);
export type BoundaryOperation = z.infer<typeof boundaryOperationSchema>;

/** Safe-to-retry read operations; writes rely on idempotencyKey dedup at the server. */
export const idempotentBoundaryReads = new Set<BoundaryOperation>([
  "subject.get",
  "subject.pairwise",
  "session.resolve",
  "client.get",
  "consent.get",
  "key.list",
  "artifact.get",
  "artifact.find_by_uid",
  "artifact.find_by_user_code",
]);

const base = {
  version: z.literal(boundaryVersion),
  correlationId: z.string().uuid(),
};
const request = <T extends BoundaryOperation, S extends z.ZodRawShape>(operation: T, payload: S) =>
  z.strictObject({ ...base, operation: z.literal(operation), payload: z.strictObject(payload) });

export const boundaryRequestSchema = z.discriminatedUnion("operation", [
  request("subject.get", { subjectId: id }),
  request("subject.pairwise", {
    subjectId: id,
    sectorIdentifier: id,
    clientId: id,
  }),
  request("session.resolve", { credential: z.string().min(1).max(8192) }),
  request("session.reauthenticate", {
    credential: z.string().min(1).max(8192),
    maxAgeSeconds: z.number().int().nonnegative(),
  }),
  request("subject.deactivate", { subjectId: id }),
  request("session.revoke", { subjectId: id, sessionId: id }),
  request("client.get", { clientId: id }),
  request("consent.get", { subjectId: id, clientId: id }),
  request("consent.upsert", { subjectId: id, clientId: id, scopes: z.array(id).max(100) }),
  request("consent.revoke", { subjectId: id, clientId: id }),
  request("key.list", {}),
  request("artifact.get", { model: id, artifactId: id }),
  request("artifact.put", {
    model: id,
    artifactId: id,
    payload: jsonValue,
    expiresAt: timestamp.optional(),
    grantId: id.optional(),
    uid: id.optional(),
    userCode: id.optional(),
  }),
  request("artifact.consume", { model: id, artifactId: id }),
  request("artifact.delete", { model: id, artifactId: id }),
  request("artifact.find_by_uid", { model: id, uid: id }),
  request("artifact.find_by_user_code", { model: id, userCode: id }),
  request("artifact.revoke_by_grant_id", { grantId: id }),
  request("audit.append", {
    eventType: id,
    actorId: id.optional(),
    subjectId: id.optional(),
    payload: jsonValue,
    occurredAt: timestamp,
  }),
  request("outbox.enqueue", { topic: id, key: id, payload: jsonValue, occurredAt: timestamp }),
]);
export type BoundaryRequest = z.infer<typeof boundaryRequestSchema>;

export const boundarySuccessSchema = z.strictObject({
  version: z.literal(boundaryVersion),
  correlationId: z.string().uuid(),
  ok: z.literal(true),
  result: jsonValue,
});

export const boundaryErrorCodeSchema = z.enum([
  "authentication_failed",
  "authorization_denied",
  "replay_detected",
  "schema_invalid",
  "version_unsupported",
  "deadline_exceeded",
  "cancelled",
  "response_too_large",
  "upstream_unavailable",
  "operation_failed",
]);
export type BoundaryErrorCode = z.infer<typeof boundaryErrorCodeSchema>;

export const boundaryFailureSchema = z.strictObject({
  version: z.literal(boundaryVersion),
  correlationId: z.string().uuid(),
  ok: z.literal(false),
  error: z.strictObject({
    code: boundaryErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
  }),
});

export const boundaryResponseSchema = z.discriminatedUnion("ok", [
  boundarySuccessSchema,
  boundaryFailureSchema,
]);
export type BoundaryResponse = z.infer<typeof boundaryResponseSchema>;

export const boundaryCredentialSchema = z.strictObject({
  id: z.string().min(1).max(128),
  secret: z.string().min(32).max(1024),
  operations: z.array(boundaryOperationSchema).min(1),
});
export type BoundaryCredential = z.infer<typeof boundaryCredentialSchema>;
