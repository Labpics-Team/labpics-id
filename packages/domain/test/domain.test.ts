import { describe, expect, it } from "bun:test";
import { ProductAccess } from "../src/aggregates/product-access";
import { AlreadyRevokedError, DomainError, InvalidEmailError } from "../src/errors";
import { Email } from "../src/value-objects/email";
import { actorId, productAccessId } from "../src/value-objects/ids";

describe("Email", () => {
  it("normalizes and validates email addresses", () => {
    expect(Email.from("  User@Example.COM ").value).toBe("user@example.com");
  });

  it("rejects malformed addresses", () => {
    expect(() => Email.from("not-an-email")).toThrow(InvalidEmailError);
    expect(() => Email.from("")).toThrow(InvalidEmailError);
  });

  it("is equal by canonical value", () => {
    expect(Email.from("A@B.io").equals(Email.from("a@b.io"))).toBe(true);
  });
});

describe("ProductAccess", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const grant = (overrides?: Partial<Parameters<typeof ProductAccess.grant>[0]>) =>
    ProductAccess.grant({
      id: productAccessId("access-1"),
      subjectId: "user-1",
      subjectType: "user",
      resource: "labpics:images",
      scope: "read",
      grantedAt: now,
      grantedBy: actorId("admin-1"),
      ...overrides,
    });

  it("is active when granted, not revoked and not expired", () => {
    expect(grant().isActive(now)).toBe(true);
  });

  it("becomes inactive after expiry", () => {
    const access = grant({ expiresAt: new Date("2026-02-01T00:00:00Z") });
    expect(access.isActive(new Date("2026-03-01T00:00:00Z"))).toBe(false);
  });

  it("rejects a grant whose expiry is not after the grant time", () => {
    expect(() => grant({ expiresAt: now })).toThrow(DomainError);
  });

  it("rejects a grant with an empty resource or scope", () => {
    expect(() => grant({ resource: "" })).toThrow(DomainError);
    expect(() => grant({ scope: "" })).toThrow(DomainError);
  });

  it("cannot be revoked twice", () => {
    const revoked = grant().revoke(new Date("2026-01-02T00:00:00Z"));
    expect(revoked.isActive(new Date("2026-01-01T01:00:00Z"))).toBe(false);
    expect(() => revoked.revoke(new Date("2026-01-03T00:00:00Z"))).toThrow(AlreadyRevokedError);
  });

  it("exposes an immutable snapshot", () => {
    const access = grant();
    const snapshot = access.snapshot;
    expect(snapshot.granted).toBe(true);
    expect(() => {
      (snapshot as { granted: boolean }).granted = false;
    }).toThrow(TypeError);
  });
});
