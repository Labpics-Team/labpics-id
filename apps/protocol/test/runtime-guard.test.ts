import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSupportedRuntime } from "../src/runtime-guard.ts";

describe("Protocol runtime guard", () => {
  it("rejects Bun runtime regardless of Node version", () => {
    assert.throws(
      () => assertSupportedRuntime({ bunPresent: true, nodeVersion: "24.15.0" }),
      /Bun is not supported/,
    );
  });

  it("rejects Node below 22.11", () => {
    for (const nodeVersion of ["20.9.0", "21.7.3", "22.10.0"]) {
      assert.throws(
        () => assertSupportedRuntime({ bunPresent: false, nodeVersion }),
        />=22\.11/,
        nodeVersion,
      );
    }
  });

  it("rejects an unparseable version", () => {
    assert.throws(() =>
      assertSupportedRuntime({ bunPresent: false, nodeVersion: "not-a-version" }),
    );
  });

  it("accepts supported Node LTS versions", () => {
    for (const nodeVersion of ["22.11.0", "22.20.1", "24.15.0"]) {
      assert.doesNotThrow(
        () => assertSupportedRuntime({ bunPresent: false, nodeVersion }),
        nodeVersion,
      );
    }
  });
});
