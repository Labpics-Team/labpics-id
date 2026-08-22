import { DomainError } from "../errors";

/** Nominal brand marker used to keep distinct domain ids distinct at the type level. */
declare const brand: unique symbol;

export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type ActorId = Branded<string, "ActorId">;
export type UserId = Branded<string, "UserId">;
export type OrganizationId = Branded<string, "OrganizationId">;
export type ProductAccessId = Branded<string, "ProductAccessId">;
/** Opaque high-entropy challenge handle, generated server-side; never derived from user input. */
export type OtpChallengeId = Branded<string, "OtpChallengeId">;

function branded<T extends string, B extends string>(value: string, brandName: B): Branded<T, B> {
  if (value.length === 0) {
    throw new DomainError(`${brandName} must not be empty`);
  }
  return value as Branded<T, B>;
}

export function actorId(value: string): ActorId {
  return branded(value, "ActorId");
}

export function userId(value: string): UserId {
  return branded(value, "UserId");
}

export function organizationId(value: string): OrganizationId {
  return branded(value, "OrganizationId");
}

export function productAccessId(value: string): ProductAccessId {
  return branded(value, "ProductAccessId");
}

export function otpChallengeId(value: string): OtpChallengeId {
  return branded(value, "OtpChallengeId");
}
