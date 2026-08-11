/**
 * Outbox port (secondary port, implemented by infrastructure).
 *
 * Delivery is at-least-once: dispatchers may redeliver after partial failure,
 * so consumers must deduplicate by `idempotencyKey`. Enqueue participates in
 * the caller's UnitOfWork transaction.
 */
import type { TransactionContext } from "./unit-of-work";

export interface OutboxEnvelope {
  readonly idempotencyKey: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}

export interface OutboxPort {
  enqueue(context: TransactionContext, envelope: OutboxEnvelope): Promise<void>;
}
