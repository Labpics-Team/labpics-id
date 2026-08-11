/*
 * Visual QA rubric — machine-checkable part (DESIGN-BRIEF.md §9, DESIGN.md §8).
 *
 * Runs in `bun test` (per-PR CI) and via `bun run qa:rubric`. Covers:
 *   T1  token purity — no raw colors outside the token source
 *   T2  spacing purity — no off-grid px in UI source
 *   T4  no `outline: none` without a replacement focus style
 *   C1  WCAG 2.2 AA contrast for every declared token pair, both themes
 *   D1  dark-theme blocks are byte-identical (no drift between the
 *       [data-theme] and prefers-color-scheme entry points)
 *   V1  no teal accent anywhere in tokens; accent anchor is #007AFF
 *   G1  react-scan/react-doctor style dev tooling stays behind NODE_ENV
 *   B1  DESIGN-BRIEF.md v2 is committed in full and reconciled with DESIGN.md
 *
 * Browser-dependent checks (axe-core, keyboard paths, reflow, reduced-motion
 * traces, Lighthouse ratchet) are specified in docs/design/QA-RUBRIC.md and
 * become executable in ch08/ch09 when the first pages exist.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { contrastRatio } from "./contrast";
import { CONTRAST_PAIRS } from "./contrast-pairs";
import { loadThemeTokens } from "./tokens-source";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const uiPackageRoot = join(import.meta.dir, "..");
const webAppRoot = join(repoRoot, "apps", "web");

const IGNORED_DIRS = new Set(["node_modules", "dist", ".next", "coverage", ".git", ".turbo"]);

function collectFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string): string {
  return relative(repoRoot, file).split(sep).join("/");
}

/* Raw-color detection. Hex needs a word-ish boundary; rgb()/hsl()/oklch()
 * literal function calls are also raw colors. var(--lab-*) is the only legal
 * color reference in UI source. */
const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RAW_COLOR_FN_RE = /\b(?:rgba?|hsla?|oklch|oklab)\s*\(/;

/* Files allowed to contain raw color values (token source of truth). */
const COLOR_SOURCE_ALLOWLIST = new Set(["packages/ui/src/tokens.css"]);

describe("T1 token purity — colors", () => {
  it("has zero raw color values in packages/ui outside the token source", () => {
    const files = collectFiles(uiPackageRoot, [".ts", ".tsx", ".css"]);
    const violations: string[] = [];
    for (const file of files) {
      const key = rel(file);
      if (COLOR_SOURCE_ALLOWLIST.has(key)) continue;
      // The QA rubric itself handles hex strings as data; scan only src/.
      if (key.startsWith("packages/ui/qa/")) continue;
      const source = readFileSync(file, "utf8");
      if (RAW_HEX_RE.test(source)) violations.push(`${key}: raw hex color`);
      if (RAW_COLOR_FN_RE.test(source)) violations.push(`${key}: raw color function`);
    }
    expect(violations).toEqual([]);
  });

  it("has zero raw color values in apps/web styles and components", () => {
    const files = collectFiles(join(webAppRoot, "src"), [".ts", ".tsx", ".css"]);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (RAW_HEX_RE.test(source)) violations.push(`${rel(file)}: raw hex color`);
      if (RAW_COLOR_FN_RE.test(source)) violations.push(`${rel(file)}: raw color function`);
    }
    expect(violations).toEqual([]);
  });
});

describe("T2 token purity — spacing", () => {
  it("uses only 4px-grid px values in committed CSS", () => {
    const files = [
      ...collectFiles(join(uiPackageRoot, "src"), [".css"]),
      ...collectFiles(join(webAppRoot, "src"), [".css"]),
    ];
    const violations: string[] = [];
    const PX_RE = /\b(\d+(?:\.\d+)?)px\b/g;
    // 1px/2px are hairline and focus-ring widths, not spacing; 999px is the
    // pill radius sentinel.
    const NON_SPACING_ALLOWED = new Set([1, 2, 999]);
    for (const file of files) {
      // Comments document rem→px equivalents of the type scale; only actual
      // declarations count.
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of source.matchAll(PX_RE)) {
        const raw = m[1];
        if (raw === undefined) continue;
        const value = Number.parseFloat(raw);
        if (NON_SPACING_ALLOWED.has(value)) continue;
        if (value % 4 !== 0) violations.push(`${rel(file)}: off-grid ${value}px`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("T4 focus safety", () => {
  it("never removes outline without a replacement focus style", () => {
    const files = [
      ...collectFiles(uiPackageRoot, [".ts", ".tsx", ".css"]),
      ...collectFiles(join(webAppRoot, "src"), [".ts", ".tsx", ".css"]),
    ];
    const violations: string[] = [];
    for (const file of files) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      const source = readFileSync(file, "utf8");
      // CSS form `outline: none` and Tailwind `outline-none` both require a
      // visible focus replacement (ring/focus-visible) in the same file.
      const removesOutline = /outline\s*:\s*none|(?:^|[\s"'`])outline-none\b/.test(source);
      if (!removesOutline) continue;
      const hasReplacement = /focus-visible|--lab-focus|ring-/.test(source);
      if (!hasReplacement) violations.push(`${rel(file)}: outline removed without focus style`);
    }
    expect(violations).toEqual([]);
  });
});

describe("C1 WCAG 2.2 AA contrast — all declared token pairs, both themes", () => {
  const { light, dark } = loadThemeTokens();

  for (const theme of ["light", "dark"] as const) {
    const tokens = theme === "light" ? light : dark;
    for (const pair of CONTRAST_PAIRS) {
      it(`${theme}: ${pair.fg} on ${pair.bg} ≥ ${pair.min}:1 (${pair.note})`, () => {
        const fgValue = tokens[pair.fg];
        const bgValue = tokens[pair.bg];
        if (fgValue === undefined) throw new Error(`Unknown token ${pair.fg} in ${theme}`);
        if (bgValue === undefined) throw new Error(`Unknown token ${pair.bg} in ${theme}`);
        const ratio = contrastRatio(fgValue, bgValue);
        expect(ratio).toBeGreaterThanOrEqual(pair.min);
      });
    }
  }
});

describe("D1 dark theme anti-drift", () => {
  it("keeps [data-theme=dark] and prefers-color-scheme blocks identical", () => {
    const { darkBlockBodies } = loadThemeTokens();
    const normalize = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("/*") && !l.startsWith("*"))
        .join("\n");
    expect(normalize(darkBlockBodies[0])).toBe(normalize(darkBlockBodies[1]));
  });
});

describe("V1 brand accent", () => {
  const { light, dark } = loadThemeTokens();

  it("anchors --lab-accent-blue at brand #007AFF in both themes", () => {
    expect(light["--lab-accent-blue"]).toBe("#007aff");
    expect(dark["--lab-accent-blue"]).toBe("#007aff");
  });

  it("contains no teal accent (brief V1: no teal anywhere)", () => {
    const css = readFileSync(join(uiPackageRoot, "src", "tokens.css"), "utf8");
    expect(css.toLowerCase()).not.toContain("teal");
  });
});

describe("G1 react dev tooling gate", () => {
  it("keeps react-scan/react-doctor imports behind NODE_ENV === 'development'", () => {
    const files = collectFiles(join(webAppRoot, "src"), [".ts", ".tsx"]);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!/react-scan|react-doctor/.test(source)) continue;
      const gated =
        /NODE_ENV\s*===\s*["']development["']/.test(source) ||
        /["']development["']\s*===\s*process\.env\.NODE_ENV/.test(source);
      if (!gated) violations.push(`${rel(file)}: dev tooling not gated by NODE_ENV`);
    }
    expect(violations).toEqual([]);
  });
});

describe("B1 design brief reconciliation", () => {
  const briefPath = join(repoRoot, "docs", "design", "DESIGN-BRIEF.md");
  const designPath = join(repoRoot, "DESIGN.md");

  it("commits the full v2 brief (not the marker)", () => {
    const brief = readFileSync(briefPath, "utf8");
    expect(brief).toContain("Labpics ID — Product Design Brief (v2)");
    expect(brief).not.toContain("Маркер-плейсхолдер");
    // All four surfaces present (51 screens: A15/B10/C18/D8).
    for (const id of ["A15", "B10", "C18", "D8"]) {
      expect(brief).toContain(`#### ${id}`);
    }
    // State contract present.
    expect(brief).toContain("## 5. State contract");
  });

  it("DESIGN.md exists with all 7 sections and the availability decision", () => {
    const design = readFileSync(designPath, "utf8");
    for (const section of [
      "Atmosphere & Identity",
      "Color",
      "Typography",
      "Spacing & Layout",
      "Components",
      "Motion & Interaction",
      "Depth & Surface",
    ]) {
      expect(design).toContain(`## `);
      expect(design).toContain(section);
    }
    expect(design).toContain("#007AFF");
    expect(design).toContain("--lab-accent-blue");
    expect(design).toContain("Geist");
    expect(design.toLowerCase()).not.toContain("teal");
  });

  it("every token the brief names for screens exists in tokens.css", () => {
    const { light } = loadThemeTokens();
    // Semantic roles the 51 screen specs reference (brief §2.1–§2.3).
    const required = [
      "--lab-bg-primary",
      "--lab-bg-secondary",
      "--lab-bg-tertiary",
      "--lab-label-p",
      "--lab-label-s",
      "--lab-label-t",
      "--lab-label-q",
      "--lab-accent-blue",
      "--lab-sentiment-success",
      "--lab-sentiment-warning",
      "--lab-sentiment-error",
      "--lab-sentiment-info",
      "--lab-space-4",
      "--lab-space-64",
      "--lab-radius-sm",
      "--lab-radius-pill",
      "--lab-shadow-3",
      "--lab-hairline",
      "--lab-font-display",
      "--lab-font-mono",
      "--lab-text-display",
      "--lab-text-mono",
      "--lab-motion-instant",
      "--lab-motion-calm",
      "--lab-motion-ceremony",
      "--lab-focus-color",
    ];
    const missing = required.filter((t) => light[t] === undefined);
    expect(missing).toEqual([]);
  });
});
