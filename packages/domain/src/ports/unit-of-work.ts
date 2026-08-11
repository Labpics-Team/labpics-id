/** Opaque transaction capability supplied by an infrastructure UnitOfWork. */
export interface TransactionContext {
  readonly transactionId: string;
}

export interface UnitOfWork {
  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}
