import { describe, expect, it } from "bun:test";
import { BootstrapControlError, createBootstrapControl } from "./bootstrap-control";

describe("bootstrap control composition", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(createBootstrapControl({ enabled: false, verifiedEmail: undefined }, null)).toBeNull();
  });

  it("fails closed without durable database or verified email", () => {
    expect(() =>
      createBootstrapControl({ enabled: true, verifiedEmail: "owner@example.com" }, null),
    ).toThrow(BootstrapControlError);
    expect(() => createBootstrapControl({ enabled: true, verifiedEmail: undefined }, null)).toThrow(
      BootstrapControlError,
    );
  });
});
