import { AlreadyRevokedError, DomainError } from "../errors";
import type { ActorId, ProductAccessId } from "../value-objects/ids";

export type SubjectType = "user" | "organization";

/** Immutable snapshot of a product access grant. */
export interface ProductAccessState {
  readonly id: ProductAccessId;
  readonly subjectId: string;
  readonly subjectType: SubjectType;
  readonly resource: string;
  readonly scope: string;
  readonly grantedAt: Date;
  readonly grantedBy: ActorId;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly granted: boolean;
}

export interface GrantProductAccessInput {
  readonly id: ProductAccessId;
  readonly subjectId: string;
  readonly subjectType: SubjectType;
  readonly resource: string;
  readonly scope: string;
  readonly grantedAt: Date;
  readonly grantedBy: ActorId;
  readonly expiresAt?: Date;
}

/**
 * Product access grant aggregate.
 *
 * Invariants:
 * - a grant is active only while granted, not revoked and not past its expiry;
 * - an already-revoked grant cannot be revoked again;
 * - an expiry that is not after the grant time is rejected at construction.
 */
export class ProductAccess {
  private readonly state: ProductAccessState;

  private constructor(state: ProductAccessState) {
    // Enforce runtime immutability: readonly is compile-time only.
    this.state = Object.freeze(state);
  }

  static grant(input: GrantProductAccessInput): ProductAccess {
    if (input.resource.length === 0) {
      throw new DomainError("product access resource must not be empty");
    }
    if (input.scope.length === 0) {
      throw new DomainError("product access scope must not be empty");
    }
    if (input.expiresAt !== undefined && input.expiresAt <= input.grantedAt) {
      throw new DomainError("expiresAt must be after grantedAt");
    }
    return new ProductAccess({
      id: input.id,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      resource: input.resource,
      scope: input.scope,
      grantedAt: input.grantedAt,
      grantedBy: input.grantedBy,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      granted: true,
    });
  }

  /** Revokes this grant. Idempotent in effect, guarded by a domain error on a second revoke. */
  revoke(at: Date): ProductAccess {
    if (this.state.revokedAt !== null) {
      throw new AlreadyRevokedError("access is already revoked");
    }
    return new ProductAccess({ ...this.state, granted: false, revokedAt: at });
  }

  isActive(at: Date): boolean {
    if (!this.state.granted) return false;
    if (this.state.revokedAt !== null) return false;
    if (this.state.expiresAt !== null && this.state.expiresAt <= at) return false;
    return true;
  }

  get snapshot(): Readonly<ProductAccessState> {
    return this.state;
  }
}
