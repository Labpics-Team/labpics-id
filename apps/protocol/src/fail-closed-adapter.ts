/**
 * Fail-closed adapter for `PROTOCOL_ADAPTER=external` until the durable
 * boundary-backed implementation lands with ch03-platform-stores.
 *
 * Selecting "external" must never silently fall back to the library's
 * in-memory quick-start adapter: stateless endpoints (discovery, JWKS) keep
 * working, while any attempt to persist or read provider state fails with an
 * explicit error instead of serving volatile data.
 */
export class ExternalAdapterNotWiredError extends Error {
  override readonly name = "ExternalAdapterNotWiredError";

  constructor(model: string, operation: string) {
    super(
      `External durable adapter is not wired yet (ch03-platform-stores): refused ${operation} on ${model}`,
    );
  }
}

export class FailClosedExternalAdapter {
  readonly #model: string;

  constructor(model: string) {
    this.#model = model;
  }

  async upsert(): Promise<void> {
    throw new ExternalAdapterNotWiredError(this.#model, "upsert");
  }

  async find(): Promise<never> {
    throw new ExternalAdapterNotWiredError(this.#model, "find");
  }

  async findByUserCode(): Promise<never> {
    throw new ExternalAdapterNotWiredError(this.#model, "findByUserCode");
  }

  async findByUid(): Promise<never> {
    throw new ExternalAdapterNotWiredError(this.#model, "findByUid");
  }

  async consume(): Promise<void> {
    throw new ExternalAdapterNotWiredError(this.#model, "consume");
  }

  async destroy(): Promise<void> {
    throw new ExternalAdapterNotWiredError(this.#model, "destroy");
  }

  async revokeByGrantId(): Promise<void> {
    throw new ExternalAdapterNotWiredError(this.#model, "revokeByGrantId");
  }
}
