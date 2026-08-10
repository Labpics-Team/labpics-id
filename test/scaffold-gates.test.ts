import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  ".git",
  "drizzle",
  ".turbo",
]);

// Character classes break self-matching: this file must never trip the scans
// it defines.
const AS_ANY_RE = /\bas\s+any\b/;
const TS_IGNORE_RE = /@[t]s-ignore/;
const TS_NOCHECK_RE = /@[t]s-nocheck/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("repo scaffold gates", () => {
  it("has no suppressed type escapes in committed sources", () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles(repoRoot)) {
      const source = readFileSync(file, "utf8");
      if (AS_ANY_RE.test(source)) violations.push(`${file}: uses 'as' plus 'any'`);
      if (TS_IGNORE_RE.test(source)) violations.push(`${file}: uses ts-ignore directive`);
      if (TS_NOCHECK_RE.test(source)) violations.push(`${file}: uses ts-nocheck directive`);
    }
    expect(violations).toEqual([]);
  });

  it("commits a bun.lock (single package manager is bun)", () => {
    expect(existsSync(join(repoRoot, "bun.lock"))).toBe(true);
  });

  it("keeps .env.example placeholder-only", () => {
    const env = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(env).toContain("replace-me");
    // No high-entropy-looking tokens (hex / base64-style) that would indicate a
    // real secret was committed.
    expect(env).not.toMatch(/[a-f0-9]{32}/i);
    expect(env).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });
});
