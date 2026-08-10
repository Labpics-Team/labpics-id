/**
 * Outbox port (secondary port, implemented by infrastructure).
 *
 * The domain enqueues events that must be delivered exactly once to other
 * bounded contexts; the implementation owns the transactional outbox table,
 * the dispatcher and the retry/dedup semantics.
 */
export interface OutboxEnvelope {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}

export interface OutboxPort {
  enqueue(envelope: OutboxEnvelope): Promise<void>;
}
