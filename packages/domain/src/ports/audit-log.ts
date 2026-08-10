/**
 * Audit logging port (secondary port, implemented by infrastructure).
 *
 * The domain emits audit facts through this port; the implementation owns the
 * append-only storage, the hash chain and the persistence details.
 */
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
  record(entry: AuditEntry): Promise<void>;
}
