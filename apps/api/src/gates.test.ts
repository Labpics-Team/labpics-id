import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const srcDir = join(import.meta.dir);

// The character classes break self-matching: this file must never trip the
// scans it defines.
const BETTER_AUTH_IMPORT_RE =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][b]etter-auth(?:["'/])/;
const AS_ANY_RE = /\bas\s+any\b/;
const TS_IGNORE_RE = /@[t]s-ignore/;
const TS_NOCHECK_RE = /@[t]s-nocheck/;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/");
}

describe("api dependency gates", () => {
  it("imports better-auth only from adapter modules", () => {
    for (const file of collectTsFiles(srcDir)) {
      if (normalize(file) === normalize(import.meta.path)) continue;
      const source = readFileSync(file, "utf8");
      const matches = source.match(BETTER_AUTH_IMPORT_RE);
      const isAdapter = normalize(file).endsWith("src/auth/better-auth.adapter.ts");
      if (isAdapter) {
        expect(matches, "the adapter module must import better-auth").not.toBeNull();
      } else {
        expect(matches, `${file} must not import better-auth`).toBeNull();
      }
    }
  });

  it("never uses suppressed type escapes or TypeScript suppression directives", () => {
    for (const file of collectTsFiles(srcDir)) {
      if (normalize(file) === normalize(import.meta.path)) continue;
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not use the 'as' + 'any' escape`).not.toMatch(AS_ANY_RE);
      expect(source, `${file} must not use a suppression directive`).not.toMatch(TS_IGNORE_RE);
      expect(source, `${file} must not use a nocheck directive`).not.toMatch(TS_NOCHECK_RE);
    }
  });
});
