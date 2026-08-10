import { describe, expect, it } from "bun:test";
import { makeAuditEvent, makeUserRow } from "./factories";

describe("@labpics/testkit factories", () => {
  it("builds a user row with defaults", () => {
    const row = makeUserRow();
    expect(row.name).toBe("Test User");
    expect(row.emailVerified).toBe(false);
    expect(row.email).toContain("@example.com");
  });

  it("builds an audit event with defaults", () => {
    const row = makeAuditEvent();
    expect(row.action).toBe("product.access.granted");
    expect(row.hash).toBe("test-hash");
    expect(row.prevHash).toBeNull();
  });

  it("applies overrides", () => {
    const row = makeUserRow({ name: "Override" });
    expect(row.name).toBe("Override");
  });
});
