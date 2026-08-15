import { z } from "zod";

// boundary-auth is intentionally NOT re-exported here: it imports node:crypto
// and must stay off the web bundle path. Consumers use the dedicated
// "@labpics/contracts/boundary-auth" subpath export.
export * from "./protocol-boundary.ts";

/**
 * Shared wire contracts between apps/api and apps/web.
 * Everything crossing the HTTP boundary in either direction is typed here.
 */

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readyResponseSchema = z.object({
  status: z.literal("ready"),
  database: z.literal("up"),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export const notReadyResponseSchema = z.object({
  status: z.literal("not_ready"),
  database: z.literal("down"),
  reason: z.string(),
});
export type NotReadyResponse = z.infer<typeof notReadyResponseSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const auditEventSchema = z.object({
  actorId: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  occurredAt: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
