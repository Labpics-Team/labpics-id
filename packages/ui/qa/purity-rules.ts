/*
 * Purity rules — pure scan functions for the visual QA rubric.
 *
 * Each rule is a pure function (source in, violations out) so the rubric can
 * run it against real files AND the test suite can prove sensitivity with
 * committed RED counterexamples (see purity-rules.test.ts). This closes the
 * class "the scan exists but nobody proved it bites".
 */

export function findArbitraryValues(source: string): string[] {
  // Tailwind arbitrary-value utilities: bg-[#fff], p-[5px], text-[17px],
  // duration-[120ms], tracking-[.2em]. Any bracketed utility value bypasses
  // the token system and is forbidden in UI source.
  const re = /(?:^|[\s"'`:])((?:[a-z][a-z0-9-]*)-\[[^\]\s]+\])/g;
  const hits: string[] = [];
  for (const m of source.matchAll(re)) {
    const hit = m[1];
    if (hit !== undefined) hits.push(hit);
  }
  return hits;
}

export function findDefaultPaletteUsage(source: string): string[] {
  // Default Tailwind palette classes (text-neutral-500, bg-red-600, ...).
  // The @theme wipes --color-*, so these compile to NOTHING - usage is a
  // silent no-op, worse than an error. Catch at source level.
  const re =
    /(?:^|[\s"'`:])((?:text|bg|border|ring|fill|stroke|decoration|divide|outline|accent|caret|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b)/g;
  const hits: string[] = [];
  for (const m of source.matchAll(re)) {
    const hit = m[1];
    if (hit !== undefined) hits.push(hit);
  }
  return hits;
}

/*
 * Default Tailwind NAMESPACE utilities. globals.css wipes these namespaces
 * (--spacing, --text-*, --shadow-*, --tracking-*, ...), so the classes below
 * compile to nothing — but their presence in source means someone tried to
 * reach around the token system. Catch the attempt, not just the no-op.
 * Utilities that ARE redefined from --lab-* (text-body, rounded-md, shadow-1,
 * p-lab-16, font-medium, ease-out, ...) are not matched.
 */
const DEFAULT_NAMESPACE_RES: ReadonlyArray<[RegExp, string]> = [
  [
    /(?:^|[\s"'`:])(-?(?:[mp][trblxyse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|size|[wh]|min-[wh]|max-h|basis|indent|scroll-[mp][trblxyse]?)-\d+(?:\.\d+)?(?![\w-]))/g,
    "numeric spacing/size utility (default --spacing scale is disabled; use *-lab-* / touch tokens)",
  ],
  [
    /(?:^|[\s"'`:])(max-w-(?:3xs|2xs|xs|sm|md|lg|xl|\dxl|prose)\b)/g,
    "default container-scale max-width (use max-w-auth/content/list/measure)",
  ],
  [
    /(?:^|[\s"'`:])(text-(?:xs|sm|base|lg|xl|\dxl)\b)/g,
    "default type-scale utility (use the role utilities text-display/h1/h2/h3/body/small/label/caps/mono-size/input)",
  ],
  [
    /(?:^|[\s"'`:])(font-(?:thin|extralight|light|normal|extrabold|black)\b)/g,
    "off-system font weight (roles use font-regular/medium/semibold/bold)",
  ],
  [
    /(?:^|[\s"'`:])(tracking-(?:tighter|tight|normal|wide|wider|widest)\b)/g,
    "default tracking utility (tracking lives inside the type roles; only tracking-caps exists)",
  ],
  [
    /(?:^|[\s"'`:])(rounded(?:-(?:xs|xl|\dxl|full))?(?=$|[\s"'`]))/g,
    "default radius utility (roles: rounded-sm/md/lg/pill)",
  ],
  [
    /(?:^|[\s"'`:])(shadow(?:-(?:2xs|xs|sm|md|lg|xl|\dxl|inner|none))?(?=$|[\s"'`]))/g,
    "default shadow utility (elevation ladder: shadow-1/2/3, focus ring: shadow-focus)",
  ],
  [
    /(?:^|[\s"'`:])(transition(?:-(?:all|colors|opacity|shadow|transform|none))?(?=$|[\s"'`]))/g,
    "default transition utility (DESIGN.md §6.1: only transition-controls with its property allow-list)",
  ],
  [
    /(?:^|[\s"'`:])((?:duration|delay)-\d+\b)/g,
    "numeric duration/delay (use duration-(--lab-motion-*))",
  ],
  [
    /(?:^|[\s"'`:])(ease-(?:in|in-out|initial)\b)/g,
    "off-system easing (only ease-out/ease-linear exist, from --lab-ease-*)",
  ],
  [
    /(?:^|[\s"'`:])(opacity-\d+\b)/g,
    "numeric opacity (roles: opacity-disabled / opacity-inactive)",
  ],
  [
    /(?:^|[\s"'`:])((?:ring|ring-offset)(?:-\d+)?\b)/g,
    "ring utilities (focus uses outline-* with --lab-focus tokens; input rings use shadow-focus)",
  ],
  [
    /(?:^|[\s"'`:])(animate-(?:spin|ping|pulse|bounce)\b)/g,
    "default animation (--animate-* is wiped; motion comes from --lab-motion tokens)",
  ],
];

/*
 * Class lists live in string literals (className="...", cva("..."), template
 * literals). Scanning only string contents keeps JSX prose ("the transition
 * was smooth") and comments from false-positiving on utility-shaped words.
 */
function extractStringLiterals(source: string): string[] {
  const out: string[] = [];
  const re =
    /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  for (const m of source.matchAll(re)) {
    const content = m[1] ?? m[2] ?? m[3];
    if (content !== undefined && content.length > 0) out.push(content);
  }
  return out;
}

export function findDefaultNamespaceUsage(source: string): string[] {
  const hits: string[] = [];
  for (const literal of extractStringLiterals(source)) {
    for (const [re, why] of DEFAULT_NAMESPACE_RES) {
      for (const m of literal.matchAll(re)) {
        const hit = m[1];
        if (hit !== undefined) hits.push(`${hit} — ${why}`);
      }
    }
  }
  return hits;
}

/*
 * transition: all in raw CSS (DESIGN.md §6.1). The TSX-side `transition-all`
 * utility is covered by findDefaultNamespaceUsage; this catches the CSS form
 * (including `transition-property: all`).
 */
export function findTransitionAll(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /transition(?:-property)?\s*:\s*[^;]*\ball\b[^;]*/g;
  const hits: string[] = [];
  for (const m of withoutComments.matchAll(re)) {
    hits.push(m[0].trim());
  }
  return hits;
}

/*
 * Forbidden decorative hues (brief V1 / DESIGN.md §2.2: no hue family besides
 * Labpics Blue exists). Any mention of teal in UI source — utility class,
 * keyword color, token name — is a violation.
 */
export function findForbiddenHues(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(/\bteal\b/gi)) {
    hits.push(m[0]);
  }
  return hits;
}

/*
 * Structural react-scan/react-doctor gate check.
 *
 * The old check was co-location: "the file mentions NODE_ENV === 'development'
 * somewhere", so an ungated call in the same file passed. This version strips
 * every properly-gated block from the source and then requires that NO
 * dev-tooling reference survives outside a gate. A top-level static
 * `import ... from "react-scan"` is always a violation: it ships the module
 * unconditionally regardless of any later runtime check.
 */
const GATE_OPEN_RE =
  /if\s*\(\s*(?:process\.env\.NODE_ENV\s*===\s*["']development["']|["']development["']\s*===\s*process\.env\.NODE_ENV)\s*\)\s*\{/g;

function stripGatedBlocks(source: string): string {
  let out = "";
  let cursor = 0;
  for (const m of source.matchAll(GATE_OPEN_RE)) {
    if (m.index === undefined || m.index < cursor) continue;
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    out += source.slice(cursor, m.index);
    cursor = i;
  }
  out += source.slice(cursor);
  return out;
}

export function findUngatedDevTooling(source: string): string[] {
  const violations: string[] = [];
  if (/^\s*import\s[^;]*["'](?:react-scan|react-doctor)["']/m.test(source)) {
    violations.push("static top-level import of dev tooling (ships unconditionally)");
  }
  const outsideGates = stripGatedBlocks(source);
  // Comments may legitimately mention the tool names (docs, rationale).
  const withoutComments = outsideGates
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  if (/react-scan|react-doctor/.test(withoutComments)) {
    violations.push("dev tooling referenced outside a NODE_ENV === 'development' gate");
  }
  return violations;
}

/*
 * Icon family purity: @labpics/icons is the ONLY icon dependency
 * (DESIGN.md §5). Any other icon family is a second visual voice.
 */
const FOREIGN_ICON_RE =
  /["'](?:@radix-ui\/react-icons|@phosphor-icons\/[a-z-]+|phosphor-react|lucide-react|lucide|@heroicons\/[a-z-]+|react-icons(?:\/[a-z0-9-]+)?|@tabler\/icons-react|iconoir-react|react-feather)["']/g;

export function findForeignIconImports(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(FOREIGN_ICON_RE)) {
    hits.push(m[0]);
  }
  return hits;
}

export function findEmoji(source: string): string[] {
  // Emojis as icons are forbidden (DESIGN.md §5). Covers emoji presentation
  // ranges; plain punctuation/arrows used in prose are not flagged.
  const re = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}]|\u{FE0F}/gu;
  const hits: string[] = [];
  for (const m of source.matchAll(re)) {
    hits.push(m[0]);
  }
  return hits;
}
