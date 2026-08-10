import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("@labpics/ui tokens", () => {
  it("keeps the placeholder contract until the DESIGN.md brief lands", () => {
    const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8");
    expect(css).toContain("PLACEHOLDER ONLY");
    expect(css).toContain("TODO(ch01-design-system)");
    expect(css).toContain("docs/design/DESIGN-BRIEF.md");
  });
});
