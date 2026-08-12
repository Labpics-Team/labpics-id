/**
 * Audit logging port (secondary port, implemented by infrastructure).
 *
 * The domain emits audit facts through this port; the implementation owns the
 * append-only storage, the hash chain and the persistence details.
 */
import type { TransactionContext } from "./unit-of-work";

export interface AuditEntry {
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: Date;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface AuditLogPort {
  record(context: TransactionContext, entry: AuditEntry): Promise<void>;
}
