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
import { CAPTION_PAIRS, CONTRAST_PAIRS } from "./contrast-pairs";
import { hexToOklch, hueDistance } from "./oklch";
import {
  findArbitraryValues,
  findDefaultNamespaceUsage,
  findDefaultPaletteUsage,
  findEmoji,
  findForbiddenHues,
  findForeignIconImports,
  findTransitionAll,
  findUngatedDevTooling,
} from "./purity-rules";
import { resolveToken } from "./resolve-color";
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
        // resolveToken follows var() chains and computes color-mix() — derived
        // tokens (hover, tints, disabled) are checked as the browser renders
        // them, not as source text.
        const ratio = contrastRatio(resolveToken(pair.fg, tokens), resolveToken(pair.bg, tokens));
        expect(ratio).toBeGreaterThanOrEqual(pair.min);
      });
    }
  }
});

describe("C2 caption tier floor (Figma baseline §3.2)", () => {
  const { light, dark } = loadThemeTokens();

  for (const theme of ["light", "dark"] as const) {
    const tokens = theme === "light" ? light : dark;
    for (const pair of CAPTION_PAIRS) {
      it(`${theme}: ${pair.fg} on ${pair.bg} ≥ ${pair.floor}:1 (${pair.note})`, () => {
        const ratio = contrastRatio(resolveToken(pair.fg, tokens), resolveToken(pair.bg, tokens));
        expect(ratio).toBeGreaterThanOrEqual(pair.floor);
      });
    }
  }

  it("keeps the label ladder ordered: p > s > t > q (luminance-distinct strengths)", () => {
    for (const tokens of [light, dark]) {
      const bg = resolveToken("--lab-bg-primary", tokens);
      const ratios = ["--lab-label-p", "--lab-label-s", "--lab-label-t", "--lab-label-q"].map(
        (name) => contrastRatio(resolveToken(name, tokens), bg),
      );
      for (let i = 1; i < ratios.length; i++) {
        const prev = ratios[i - 1];
        const curr = ratios[i];
        if (prev === undefined || curr === undefined) throw new Error("ladder incomplete");
        expect(prev).toBeGreaterThan(curr);
      }
    }
  });

  it("keeps the border ladder ordered: strong is more visible than hairline", () => {
    for (const tokens of [light, dark]) {
      const bg = resolveToken("--lab-bg-primary", tokens);
      const hairline = contrastRatio(resolveToken("--lab-border-hairline", tokens), bg);
      const strong = contrastRatio(resolveToken("--lab-border-strong", tokens), bg);
      expect(strong).toBeGreaterThan(hairline);
    }
  });
});

describe("F1 Figma baseline (docs/design/FIGMA-BASELINE.md, BL-009)", () => {
  const { light } = loadThemeTokens();

  it("composites the light label ladder from the #3C3C43 ink at 72/52/32%", () => {
    expect(light["--lab-label-ink"]?.toLowerCase()).toBe("#3c3c43");
    expect(resolveToken("--lab-label-p", light)).toBe("#101012");
    expect(resolveToken("--lab-label-s", light)).toBe("#737378");
    expect(resolveToken("--lab-label-t", light)).toBe("#9a9a9d");
    expect(resolveToken("--lab-label-q", light)).toBe("#c1c1c3");
  });

  it("derives borders from the #787880 ink at 8/16% over the card", () => {
    expect(light["--lab-border-ink"]?.toLowerCase()).toBe("#787880");
    expect(resolveToken("--lab-border-hairline", light)).toBe("#f4f4f5");
    expect(resolveToken("--lab-border-strong", light)).toBe("#e9e9eb");
  });

  it("anchors the error sentiment at #FF3B30 with a derived text member", () => {
    expect(resolveToken("--lab-sentiment-error", light)).toBe("#ff3b30");
    const text = resolveToken("--lab-sentiment-error-text", light);
    expect(contrastRatio(text, resolveToken("--lab-bg-primary", light))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("ships the Figma radius roles (4/12/24) and auth-card metrics", () => {
    expect(light["--lab-radius-sm"]).toBe("4px");
    expect(light["--lab-radius-md"]).toBe("12px");
    expect(light["--lab-radius-lg"]).toBe("24px");
    expect(light["--lab-size-control"]).toBe("3rem");
    expect(light["--lab-size-otp-w"]).toBe("3rem");
    expect(light["--lab-size-otp-h"]).toBe("3.5rem");
    expect(light["--lab-size-logo-tile"]).toBe("3rem");
    expect(light["--lab-shell-auth"]).toBe("30rem");
    expect(light["--lab-shell-auth-content"]).toBe("24rem");
    expect(light["--lab-space-36"]).toBe("2.25rem");
  });

  it("ships the title (20/20 SemiBold, −0.33px) and caption (12/16 Medium) roles", () => {
    expect(light["--lab-text-title"]).toBe("1.25rem");
    expect(light["--lab-text-title-lh"]).toBe("calc(20 / 20)");
    expect(light["--lab-text-title-weight"]).toBe("var(--lab-weight-semibold)");
    // −0.33px at 20px = −0.0165em.
    expect(light["--lab-text-title-tracking"]).toBe("-0.0165em");
    expect(light["--lab-text-caption"]).toBe("0.75rem");
    expect(light["--lab-text-caption-lh"]).toBe("calc(16 / 12)");
    expect(light["--lab-text-caption-weight"]).toBe("var(--lab-weight-medium)");
  });

  it("ships the primary-action finish and the auth-card shadow stack", () => {
    expect(light["--lab-accent-gradient"]).toContain("linear-gradient");
    expect(light["--lab-accent-gradient"]).toContain("20%");
    expect(light["--lab-shadow-inset-control"]).toContain("inset 0 -1px 1px");
    expect(light["--lab-shadow-inset-control"]).toContain("12%");
    const card = light["--lab-shadow-card"];
    if (card === undefined) throw new Error("Missing --lab-shadow-card");
    // Four layers (one color-mix each), geometry and alphas 12/4/2/1 from the
    // Figma stack: 0 0 1px / 0 1px 1px / 0 2px 2px / 0 4px 2px.
    expect(card.match(/color-mix\(/g)).toHaveLength(4);
    for (const [geometry, pct] of [
      ["0 0 1px 0", "12%"],
      ["0 1px 1px 0", "4%"],
      ["0 2px 2px 0", "2%"],
      ["0 4px 2px 0", "1%"],
    ] as const) {
      expect(card).toContain(geometry);
      expect(card).toContain(pct);
    }
    expect(light["--lab-color-shadow"]?.toLowerCase()).toBe("#101012");
  });
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
    // Hex is case-insensitive; DESIGN.md documents #007AFF, tokens.css may
    // use either casing.
    expect(light["--lab-accent-blue"]?.toLowerCase()).toBe("#007aff");
    expect(dark["--lab-accent-blue"]?.toLowerCase()).toBe("#007aff");
  });

  it("contains no forbidden hue in ANY ui/web source — tokens, CSS and TSX (brief V1)", () => {
    const files = [
      ...collectFiles(uiPackageRoot, [".ts", ".tsx", ".css"]),
      ...collectFiles(join(webAppRoot, "src"), [".ts", ".tsx", ".css"]),
    ];
    const violations: string[] = [];
    for (const file of files) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      for (const hit of findForbiddenHues(readFileSync(file, "utf8"))) {
        violations.push(`${rel(file)}: ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("O1 OKLCH hue stability", () => {
  const { light, dark } = loadThemeTokens();

  const FAMILY = [
    "--lab-accent-blue",
    "--lab-accent-blue-strong",
    "--lab-accent-blue-hover",
    "--lab-accent-text",
  ] as const;

  for (const theme of ["light", "dark"] as const) {
    const tokens = theme === "light" ? light : dark;
    it(`${theme}: every accent-family member stays within 10° of the #007AFF anchor`, () => {
      const anchorHue = hexToOklch(resolveToken("--lab-accent-blue", tokens)).h;
      const drifts: string[] = [];
      for (const name of FAMILY) {
        const { h, c } = hexToOklch(resolveToken(name, tokens));
        if (c < 0.02) continue; // achromatic members have no meaningful hue
        const d = hueDistance(h, anchorHue);
        if (d >= 10) drifts.push(`${name}: ${d.toFixed(1)}° from anchor`);
      }
      expect(drifts).toEqual([]);
    });
  }

  it("keeps neutrals in one temperature band (cool, chroma ≤ 0.03)", () => {
    const NEUTRALS = [
      "--lab-bg-secondary",
      "--lab-bg-tertiary",
      "--lab-label-p",
      "--lab-label-s",
      "--lab-label-t",
      "--lab-border-hairline",
    ] as const;
    for (const theme of [light, dark]) {
      for (const name of NEUTRALS) {
        const { c, h } = hexToOklch(resolveToken(name, theme));
        expect(c).toBeLessThanOrEqual(0.03);
        if (c > 0.002) {
          // Cool band around the accent hue — a warm grey would read as a
          // second temperature (DESIGN.md §2.3).
          expect(h).toBeGreaterThanOrEqual(230);
          expect(h).toBeLessThanOrEqual(290);
        }
      }
    }
  });
});

describe("T7 typography derivation law (DESIGN.md §3.1)", () => {
  const { light } = loadThemeTokens();

  const px = (name: string): number => {
    const v = light[name];
    if (v === undefined) throw new Error(`Missing token ${name}`);
    const m = v.match(/^([\d.]+)rem$/);
    if (!m || m[1] === undefined) throw new Error(`${name} is not a rem value: ${v}`);
    return Number.parseFloat(m[1]) * 16;
  };

  it("derives the ladder from base 15px by ×1.25 snapped to the nearest even px", () => {
    const snapEven = (n: number) => Math.round(n / 2) * 2;
    let step = px("--lab-text-body");
    expect(step).toBe(15);
    for (const role of ["--lab-text-h3", "--lab-text-h2", "--lab-text-h1", "--lab-text-display"]) {
      step = snapEven(step * 1.25);
      expect(px(role)).toBe(step);
    }
  });

  it("holds the persistent-UI floor (13px) and the input floor (16px)", () => {
    for (const role of [
      "--lab-text-small",
      "--lab-text-label",
      "--lab-text-caps",
      "--lab-text-mono",
    ]) {
      expect(px(role)).toBe(13);
    }
    expect(px("--lab-text-input")).toBeGreaterThanOrEqual(16);
  });

  it("stores line heights as visible calc(box/size) fractions with 4px-multiple boxes in band", () => {
    const HEADING_BAND = [1.15, 1.35] as const;
    const BODY_BAND = [1.4, 1.65] as const;
    const roles: Array<[string, string, readonly [number, number]]> = [
      ["--lab-text-display", "--lab-text-display-lh", HEADING_BAND],
      ["--lab-text-h1", "--lab-text-h1-lh", HEADING_BAND],
      ["--lab-text-h2", "--lab-text-h2-lh", HEADING_BAND],
      ["--lab-text-h3", "--lab-text-h3-lh", HEADING_BAND],
      ["--lab-text-body", "--lab-text-body-lh", BODY_BAND],
      ["--lab-text-small", "--lab-text-small-lh", BODY_BAND],
      ["--lab-text-label", "--lab-text-label-lh", BODY_BAND],
      ["--lab-text-caps", "--lab-text-caps-lh", BODY_BAND],
      ["--lab-text-mono", "--lab-text-mono-lh", BODY_BAND],
      ["--lab-text-input", "--lab-text-input-lh", BODY_BAND],
    ];
    for (const [sizeToken, lhToken, [lo, hi]] of roles) {
      const lhValue = light[lhToken];
      if (lhValue === undefined) throw new Error(`Missing ${lhToken}`);
      const m = lhValue.match(/^calc\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)$/);
      if (!m || m[1] === undefined || m[2] === undefined) {
        throw new Error(`${lhToken} must be calc(box / size), got: ${lhValue}`);
      }
      const box = Number.parseFloat(m[1]);
      const size = Number.parseFloat(m[2]);
      expect(size).toBe(px(sizeToken)); // denominator IS the role size
      expect(box % 4).toBe(0); // line box on the 4px grid
      const lh = box / size;
      expect(lh).toBeGreaterThanOrEqual(lo);
      expect(lh).toBeLessThanOrEqual(hi);
    }
  });

  it("grades tracking with size: negative on display→h3, zero on body, positive only on caps", () => {
    const tr = (name: string): number => {
      const v = light[name];
      if (v === undefined) throw new Error(`Missing ${name}`);
      const m = v.match(/^(-?[\d.]+)em$/);
      if (!m || m[1] === undefined) throw new Error(`${name} is not an em value: ${v}`);
      return Number.parseFloat(m[1]);
    };
    const display = tr("--lab-text-display-tracking");
    const h1 = tr("--lab-text-h1-tracking");
    const h2 = tr("--lab-text-h2-tracking");
    const h3 = tr("--lab-text-h3-tracking");
    expect(display).toBeLessThan(h1);
    expect(h1).toBeLessThan(h2);
    expect(h2).toBeLessThan(h3);
    expect(h3).toBeLessThan(0);
    expect(tr("--lab-text-body-tracking")).toBe(0);
    expect(tr("--lab-text-small-tracking")).toBe(0);
    expect(tr("--lab-text-mono-tracking")).toBe(0);
    expect(tr("--lab-text-caps-tracking")).toBeGreaterThan(0);
  });

  it("declares role weights within 400–600 and a press scale ≥ 0.95", () => {
    for (const role of ["display", "h1", "h2", "h3"]) {
      expect(light[`--lab-text-${role}-weight`]).toBe("var(--lab-weight-semibold)");
    }
    expect(light["--lab-weight-semibold"]).toBe("600");
    expect(light["--lab-weight-regular"]).toBe("400");
    const scale = Number.parseFloat(light["--lab-press-scale"] ?? "0");
    expect(scale).toBeGreaterThanOrEqual(0.95);
    expect(scale).toBeLessThan(1);
  });
});

describe("G1 react dev tooling gate (structural)", () => {
  it("keeps every react-scan/react-doctor reference inside a NODE_ENV === 'development' block", () => {
    const files = collectFiles(join(webAppRoot, "src"), [".ts", ".tsx"]);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const v of findUngatedDevTooling(source)) {
        violations.push(`${rel(file)}: ${v}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("T6 Tailwind drift (TSX class purity)", () => {
  const tsxFiles = () => [
    ...collectFiles(join(webAppRoot, "src"), [".ts", ".tsx"]),
    ...collectFiles(join(uiPackageRoot, "src"), [".ts", ".tsx"]),
  ];

  it("has zero arbitrary-value utilities (bg-[..], p-[..], text-[..], duration-[..])", () => {
    const violations: string[] = [];
    for (const file of tsxFiles()) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      for (const hit of findArbitraryValues(readFileSync(file, "utf8"))) {
        violations.push(`${rel(file)}: ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("has zero default Tailwind palette classes (silent no-ops after @theme wipe)", () => {
    const violations: string[] = [];
    for (const file of tsxFiles()) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      for (const hit of findDefaultPaletteUsage(readFileSync(file, "utf8"))) {
        violations.push(`${rel(file)}: ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("has zero default Tailwind namespace utilities (wiped namespaces cannot be reached for)", () => {
    const violations: string[] = [];
    for (const file of tsxFiles()) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      for (const hit of findDefaultNamespaceUsage(readFileSync(file, "utf8"))) {
        violations.push(`${rel(file)}: ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("has zero `transition: all` in committed CSS (DESIGN.md §6.1 property allow-list)", () => {
    const cssFiles = [
      ...collectFiles(join(uiPackageRoot, "src"), [".css"]),
      ...collectFiles(join(webAppRoot, "src"), [".css"]),
    ];
    const violations: string[] = [];
    for (const file of cssFiles) {
      for (const hit of findTransitionAll(readFileSync(file, "utf8"))) {
        violations.push(`${rel(file)}: ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("has zero foreign icon families and zero emojis in component source", () => {
    const violations: string[] = [];
    for (const file of tsxFiles()) {
      if (rel(file).startsWith("packages/ui/qa/")) continue;
      const source = readFileSync(file, "utf8");
      for (const hit of findForeignIconImports(source)) {
        violations.push(`${rel(file)}: foreign icon family ${hit}`);
      }
      for (const hit of findEmoji(source)) {
        violations.push(`${rel(file)}: emoji ${hit}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("R0 breakpoint sync", () => {
  it("apps/web @theme --breakpoint-* equals tokens.css --bp-* (one min-width convention)", () => {
    const { light } = loadThemeTokens();
    const globals = readFileSync(join(webAppRoot, "src", "app", "globals.css"), "utf8");
    const read = (name: string): string => {
      const m = globals.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      if (!m || m[1] === undefined) throw new Error(`Missing ${name} in globals.css`);
      return m[1].trim();
    };
    expect(read("--breakpoint-sm")).toBe(light["--bp-sm"]);
    expect(read("--breakpoint-lg")).toBe(light["--bp-lg"]);
  });
});

describe("B1 design brief reconciliation", () => {
  const briefPath = join(repoRoot, "docs", "design", "DESIGN-BRIEF.md");
  const designPath = join(repoRoot, "DESIGN.md");

  it("commits the full v2 brief (not the marker)", () => {
    const brief = readFileSync(briefPath, "utf8");
    expect(brief).toContain("Labpics ID — Product Design Brief (v2)");
    expect(brief).not.toContain("Маркер-плейсхолдер");
    // State contract present.
    expect(brief).toContain("## 5. State contract");
  });

  it("contains every one of the 51 screens individually (A1–A15, B1–B10, C1–C18, D1–D8)", () => {
    const brief = readFileSync(briefPath, "utf8");
    const surfaces: Array<[string, number]> = [
      ["A", 15],
      ["B", 10],
      ["C", 18],
      ["D", 8],
    ];
    const missing: string[] = [];
    for (const [prefix, count] of surfaces) {
      for (let n = 1; n <= count; n++) {
        // Screen headings are `#### A1. Title` — the dot prevents A1 matching A10.
        if (!brief.includes(`#### ${prefix}${n}.`)) missing.push(`${prefix}${n}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every component the 51 screens reference is declared in the DESIGN.md inventory", () => {
    // Self-maintaining oracle: component names are EXTRACTED from the brief's
    // per-screen `C:` lines at test time, so adding a screen or a component
    // to the brief automatically extends the reconciliation surface. Deleting
    // a name from DESIGN.md §5 goes RED.
    const brief = readFileSync(briefPath, "utf8");
    const design = readFileSync(designPath, "utf8");
    const referenced = new Set<string>();
    for (const line of brief.split("\n")) {
      if (!/^\s*-\s*\*\*C:?\*\*/.test(line)) continue;
      for (const m of line.matchAll(/`([A-Z][A-Za-z0-9]*)/g)) {
        const name = m[1];
        if (name !== undefined) referenced.add(name);
      }
    }
    // Sanity: the extraction itself must not be vacuous.
    expect(referenced.size).toBeGreaterThan(100);
    const missing = [...referenced].filter((name) => !design.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });

  it("DESIGN.md exists with all 7 sections as real headings", () => {
    const design = readFileSync(designPath, "utf8");
    // Heading lines like "## 1. Atmosphere & Identity" — the section must be
    // an actual h2, not a prose mention or a TOC entry.
    const headings = design
      .split("\n")
      .filter((l: string) => l.startsWith("## "))
      .map((l: string) => l.replace(/^##\s+(?:\d+\.\s+)?/, "").trim());
    for (const section of [
      "Atmosphere & Identity",
      "Color",
      "Typography",
      "Spacing & Layout",
      "Components",
      "Motion & Interaction",
      "Depth & Surface",
    ]) {
      expect(headings).toContain(section);
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
