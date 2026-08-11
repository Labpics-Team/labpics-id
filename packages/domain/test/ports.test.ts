import { describe, expect, it } from "bun:test";
import type {
  AuditEntry,
  AuditLogPort,
  OutboxEnvelope,
  OutboxPort,
  TransactionContext,
  UnitOfWork,
} from "../src";

describe("transactional effect ports", () => {
  it("delegates audit and outbox writes with the UnitOfWork transaction context", async () => {
    const context: TransactionContext = { transactionId: "tx-1" };
    const receivedContexts: TransactionContext[] = [];
    const audit: AuditLogPort = {
      record: async (received) => {
        receivedContexts.push(received);
      },
    };
    const outbox: OutboxPort = {
      enqueue: async (received) => {
        receivedContexts.push(received);
      },
    };
    const unitOfWork: UnitOfWork = { run: async (work) => work(context) };
    const entry: AuditEntry = {
      actorId: "actor-1",
      action: "member.created",
      targetType: "member",
      targetId: "member-1",
      occurredAt: new Date("2026-08-11T00:00:00Z"),
    };
    const envelope: OutboxEnvelope = {
      idempotencyKey: "member-1:created",
      type: "member.created",
      payload: { memberId: "member-1" },
      occurredAt: entry.occurredAt,
    };

    await unitOfWork.run(async (transaction) => {
      await audit.record(transaction, entry);
      await outbox.enqueue(transaction, envelope);
    });

    expect(receivedContexts).toEqual([context, context]);
    expect(envelope.idempotencyKey).toBe("member-1:created");
  });
});
