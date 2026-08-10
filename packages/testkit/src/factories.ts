import type { NewAuditEvent, NewUser } from "@labpics/db";

/** Builds a users row with deterministic defaults; pass overrides per test. */
export function makeUserRow(overrides: Partial<NewUser> = {}): NewUser {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "Test User",
    email: overrides.email ?? `test-${crypto.randomUUID()}@example.com`,
    emailVerified: overrides.emailVerified ?? false,
    image: overrides.image ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

/** Builds an audit_events row with deterministic defaults. */
export function makeAuditEvent(overrides: Partial<NewAuditEvent> = {}): NewAuditEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    actorId: overrides.actorId ?? "actor-1",
    action: overrides.action ?? "product.access.granted",
    targetType: overrides.targetType ?? "product_access",
    targetId: overrides.targetId ?? "access-1",
    ip: overrides.ip ?? "127.0.0.1",
    userAgent: overrides.userAgent ?? "test-agent",
    occurredAt: overrides.occurredAt ?? new Date(),
    prevHash: overrides.prevHash ?? null,
    hash: overrides.hash ?? "test-hash",
  };
}
