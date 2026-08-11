/*
 * Anti-vacuity proof for the contrast gate (lead requirement: sensitivity
 * demonstrated by a committed unit case, not a transient sabotage run).
 *
 * These cases pin the oracle to known WCAG reference values and prove that a
 * genuinely failing pair is REJECTED — so a rubric GREEN cannot be vacuous.
 */

import { describe, expect, it } from "bun:test";
import { contrastRatio, parseHex, relativeLuminance } from "./contrast";

describe("contrast oracle — reference vectors", () => {
  it("black on white is exactly 21:1 (WCAG canonical maximum)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("a color against itself is exactly 1:1", () => {
    expect(contrastRatio("#007aff", "#007aff")).toBeCloseTo(1, 10);
  });

  it("is symmetric in its arguments", () => {
    expect(contrastRatio("#16181d", "#f7f8fa")).toBeCloseTo(
      contrastRatio("#f7f8fa", "#16181d"),
      10,
    );
  });

  it("matches the published luminance of sRGB white and black", () => {
    expect(relativeLuminance(parseHex("#ffffff"))).toBeCloseTo(1, 10);
    expect(relativeLuminance(parseHex("#000000"))).toBeCloseTo(0, 10);
  });
});

describe("contrast oracle — sensitivity (known counterexamples MUST fail)", () => {
  it("rejects #777777 on #ffffff for body text (known 4.48:1 < 4.5)", () => {
    const ratio = contrastRatio("#777777", "#ffffff");
    expect(ratio).toBeLessThan(4.5);
    expect(ratio).toBeGreaterThan(4.4); // pins the borderline value, not a trivial miss
  });

  it("rejects brand #007AFF on white for body text (this is WHY --lab-accent-text exists)", () => {
    expect(contrastRatio("#007aff", "#ffffff")).toBeLessThan(4.5);
  });

  it("rejects a degraded label token (#cccccc on #ffffff) far below AA", () => {
    expect(contrastRatio("#cccccc", "#ffffff")).toBeLessThan(3);
  });
});

describe("contrast oracle — hostile input", () => {
  it("throws on non-hex values instead of silently passing", () => {
    expect(() => contrastRatio("var(--lab-label-p)", "#ffffff")).toThrow();
    expect(() => contrastRatio("#12345", "#ffffff")).toThrow();
    expect(() => contrastRatio("rgb(0,0,0)", "#ffffff")).toThrow();
  });

  it("expands 3-digit hex correctly (#fff === #ffffff)", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
  });
});
