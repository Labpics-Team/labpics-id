import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("@labpics/ui tokens", () => {
  it("is the committed DESIGN.md token set (placeholder contract retired)", () => {
    const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8");
    expect(css).not.toContain("PLACEHOLDER ONLY");
    expect(css).toContain("--lab-accent-blue");
    expect(css).toContain("DESIGN.md");
  });
});
