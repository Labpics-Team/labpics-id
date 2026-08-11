/*
 * Token value resolver — turns a token's declared value (raw hex, var()
 * chains, color-mix() derivations) into a concrete #rrggbb hex.
 *
 * DESIGN.md §2.1 makes interaction colors DERIVED (color-mix in tokens.css),
 * so the contrast oracle can no longer read hex straight out of the file: it
 * must resolve the same computation the browser performs. Scope is exactly
 * what tokens.css uses — `color-mix(in srgb, X p%, Y)` with linear sRGB
 * component interpolation — and the resolver throws on anything it does not
 * understand rather than guessing.
 */

import { parseHex, type Rgb } from "./contrast";

function toHex(rgb: Rgb): string {
  const p = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${p(rgb.r)}${p(rgb.g)}${p(rgb.b)}`;
}

const NAMED: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
};

function splitTopLevelArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) args.push(current.trim());
  return args;
}

export function resolveColor(
  value: string,
  tokens: Record<string, string>,
  seen: Set<string> = new Set(),
): string {
  const v = value.trim();

  if (v.startsWith("#")) return toHex(parseHex(v));

  const named = NAMED[v.toLowerCase()];
  if (named !== undefined) return named;

  const varMatch = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i);
  if (varMatch?.[1] !== undefined) {
    const name = varMatch[1];
    if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
    seen.add(name);
    const target = tokens[name] ?? varMatch[2];
    if (target === undefined) throw new Error(`Unknown token in var(): ${name}`);
    return resolveColor(target, tokens, seen);
  }

  if (v.toLowerCase().startsWith("color-mix(")) {
    const inner = v.slice(v.indexOf("(") + 1, v.lastIndexOf(")"));
    const args = splitTopLevelArgs(inner);
    if (args.length !== 3 || !/^in\s+srgb$/i.test(args[0] ?? "")) {
      throw new Error(`Unsupported color-mix form: ${v}`);
    }
    const parseComponent = (arg: string): { color: string; pct: number | undefined } => {
      const m = arg.match(/^(.*?)\s+(\d+(?:\.\d+)?)%$/);
      if (m?.[1] !== undefined && m[2] !== undefined) {
        return { color: m[1].trim(), pct: Number.parseFloat(m[2]) };
      }
      return { color: arg.trim(), pct: undefined };
    };
    const a = parseComponent(args[1] ?? "");
    const b = parseComponent(args[2] ?? "");
    const pctA = a.pct ?? (b.pct !== undefined ? 100 - b.pct : 50);
    const pctB = b.pct ?? 100 - pctA;
    if (Math.abs(pctA + pctB - 100) > 1e-6) {
      throw new Error(`color-mix percentages must sum to 100: ${v}`);
    }
    const rgbA = parseHex(resolveColor(a.color, tokens, new Set(seen)));
    const rgbB = parseHex(resolveColor(b.color, tokens, new Set(seen)));
    const t = pctA / 100;
    return toHex({
      r: rgbA.r * t + rgbB.r * (1 - t),
      g: rgbA.g * t + rgbB.g * (1 - t),
      b: rgbA.b * t + rgbB.b * (1 - t),
    });
  }

  throw new Error(`Unresolvable color value: ${JSON.stringify(value)}`);
}

/** Resolves a token by name to a concrete hex color. */
export function resolveToken(name: string, tokens: Record<string, string>): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`Unknown token: ${name}`);
  return resolveColor(value, tokens, new Set([name]));
}
