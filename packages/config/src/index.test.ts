import { describe, expect, it } from "bun:test";
import { loadPreset } from "./index";

describe("@labpics/config", () => {
  it("loads every preset as valid JSON", () => {
    for (const file of [
      "tsconfig/base.json",
      "tsconfig/bun.json",
      "tsconfig/nextjs.json",
      "biome.preset.json",
    ] as const) {
      expect(() => loadPreset(file)).not.toThrow();
    }
  });

  it("base tsconfig enforces the strict bootstrap flags", () => {
    const base = loadPreset("tsconfig/base.json") as {
      compilerOptions: Record<string, unknown>;
    };
    const options = base.compilerOptions;
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(options.verbatimModuleSyntax).toBe(true);
  });
});
