/** Base class for all domain-level rule violations. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class InvalidEmailError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmailError";
  }
}

export class AlreadyRevokedError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyRevokedError";
  }
}
