/*
 * WCAG 2.2 contrast math (pure core, no I/O).
 *
 * Implements the normative formulas from WCAG 2.2 ("relative luminance" and
 * "contrast ratio", https://www.w3.org/TR/WCAG22/#dfn-relative-luminance).
 * Used by the QA rubric to machine-check every token pair declared in
 * DESIGN.md. This module is the oracle, so it stays dependency-free and
 * directly comparable to the standard.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(hex: string): Rgb {
  if (!HEX_RE.test(hex)) {
    throw new Error(`Not a parseable hex color: ${JSON.stringify(hex)}`);
  }
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function channelLuminance(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** WCAG contrast ratio, 1..21. Order of arguments does not matter. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(parseHex(hexA));
  const lb = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
