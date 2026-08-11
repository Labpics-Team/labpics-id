/*
 * OKLCH conversion (pure math, no I/O) — used by the QA rubric to assert hue
 * stability of the accent family (DESIGN.md §2.2: every member within 10° of
 * the anchor per theme) and the neutral temperature band (§2.3).
 *
 * Implements the standard sRGB → linear → LMS → OKLab → LCh pipeline
 * (Björn Ottosson's reference constants, as adopted by CSS Color 4).
 */

import { parseHex } from "./contrast";

export interface Oklch {
  l: number;
  c: number;
  /** Hue in degrees, 0–360. Meaningless when c ≈ 0 (achromatic). */
  h: number;
}

function srgbToLinear(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = parseHex(hex);
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(okA, okB);
  let h = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: okL, c, h };
}

/** Smallest angular distance between two hues, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
