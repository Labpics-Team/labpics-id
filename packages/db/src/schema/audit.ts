import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only audit log with a hash chain.
 *
 * The chain invariant: `hash = H(prev_hash, canonical(event))`. `prev_hash` is
 * NULL only for the first event in the chain. Schema-only for now; the chain
 * implementation lands with the audit chapter.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (table) => [
    index("audit_events_actor_id_idx").on(table.actorId),
    index("audit_events_occurred_at_idx").on(table.occurredAt),
  ],
);

/**
 * Transactional outbox for at-least-once cross-context delivery. Dispatchers
 * may redeliver, so consumers must deduplicate using an idempotency key carried
 * in the envelope payload. Dispatcher processing lands with the outbox chapter.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("outbox_status_available_at_idx").on(table.status, table.availableAt)],
);
