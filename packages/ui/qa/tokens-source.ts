/*
 * Reads packages/ui/src/tokens.css into per-theme token maps.
 *
 * The parser is deliberately strict: it understands exactly the structure the
 * token file commits to (a :root light block, a [data-theme="dark"] block and
 * a prefers-color-scheme dark mirror). Structural drift breaks the QA rubric
 * loudly instead of silently skipping assertions.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TOKENS_CSS_PATH = join(import.meta.dir, "..", "src", "tokens.css");

export interface ThemeTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
  /** Raw inner CSS of the two dark blocks, for the anti-drift identity check. */
  darkBlockBodies: [string, string];
}

const DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

function parseDeclarations(cssBlock: string): Record<string, string> {
  // Strip comments first: a commented-out declaration must never become a
  // live token (it would let B1 presence checks and contrast assertions pass
  // against stale values).
  const withoutComments = cssBlock.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of withoutComments.matchAll(DECL_RE)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) continue;
    out[name] = value.trim();
  }
  return out;
}

/** Extracts the body of the block opened by the first match of `opener`. */
function extractBlock(css: string, opener: RegExp): string {
  const m = opener.exec(css);
  if (!m || m.index === undefined) {
    throw new Error(`tokens.css structure drift: missing block ${opener}`);
  }
  const start = css.indexOf("{", m.index);
  if (start === -1) throw new Error(`tokens.css structure drift: no '{' after ${opener}`);
  let depth = 1;
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  throw new Error(`tokens.css structure drift: unbalanced braces for ${opener}`);
}

export function loadThemeTokens(): ThemeTokens {
  const css = readFileSync(TOKENS_CSS_PATH, "utf8");

  const lightBlock = extractBlock(css, /:root\s*\{/);
  const darkExplicit = extractBlock(css, /\[data-theme="dark"\]\s*\{/);
  const darkMediaOuter = extractBlock(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  const darkMedia = extractBlock(darkMediaOuter, /:root:not\(\[data-theme="light"\]\)\s*\{/);

  const light = parseDeclarations(lightBlock);
  const dark = { ...light, ...parseDeclarations(darkExplicit) };

  return { light, dark, darkBlockBodies: [darkExplicit, darkMedia] };
}
