import type { TransactionContext, UnitOfWork } from "@labpics/domain";
import type { Database } from "./client";

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface PostgresTransactionContext extends TransactionContext {
  readonly transaction: DatabaseTransaction;
}

/** Runs all participating infrastructure writes in one Postgres transaction. */
export class PostgresUnitOfWork implements UnitOfWork {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  run<T>(work: (context: PostgresTransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction((transaction) =>
      work({ transactionId: crypto.randomUUID(), transaction }),
    );
  }
}
