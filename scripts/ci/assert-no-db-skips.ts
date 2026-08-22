/**
 * INV-17 skip-inventory gate: fail CI when any DB-gated test is skipped.
 *
 * PostgreSQL-backed suites use describe.skipIf(TEST_DATABASE_URL === undefined),
 * so a missing/overridden env var silently turns security-critical suites into
 * green no-ops. This gate parses the bun junit report and fails with a full
 * inventory of skipped tests in DB-gated files, making skip-evasion a hard
 * CI failure instead of a silent pass.
 *
 * Usage: bun scripts/ci/assert-no-db-skips.ts <junit-report.xml>
 * Exit codes: 0 = no relevant skips; 1 = relevant skips found; 2 = report unreadable.
 */
import { readFileSync } from "node:fs";

export interface SkippedTest {
  readonly file: string;
  readonly classname: string;
  readonly name: string;
}

/** Path patterns whose tests must never skip in CI (posix-normalized). */
const RELEVANT_PATTERNS: readonly RegExp[] = [
  /(^|\/)packages\/db\/test\//,
  /\.integration\.test\.(?:ts|tsx|js|jsx)$/,
];

/**
 * DB-gated test files outside the pattern set above: they contain
 * describe.skipIf(TEST_DATABASE_URL === undefined) suites and therefore
 * must also never skip in CI. Keep in sync when adding DB-gated suites.
 */
export const DB_GATED_FILES: readonly string[] = [
  "apps/api/src/app.test.ts",
  "apps/api/src/routes/lifecycle.test.ts",
  "apps/api/src/auth/better-auth.adapter.test.ts",
];

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isRelevantFile(file: string): boolean {
  const normalized = normalizePath(file);
  if (RELEVANT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return DB_GATED_FILES.some((gated) => normalized === gated || normalized.endsWith(`/${gated}`));
}

const TESTCASE_RE = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value.replaceAll(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

function readAttribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] === undefined ? "" : decodeEntities(match[1]);
}

/** Extract every skipped testcase (skipped or todo) from a bun junit report. */
export function parseSkippedTests(xml: string): SkippedTest[] {
  const skipped: SkippedTest[] = [];
  for (const match of xml.matchAll(TESTCASE_RE)) {
    const body = match[2];
    if (body === undefined || !/<skipped\b/.test(body)) {
      continue;
    }
    const attributes = match[1] ?? "";
    skipped.push({
      file: normalizePath(readAttribute(attributes, "file")),
      classname: readAttribute(attributes, "classname"),
      name: readAttribute(attributes, "name"),
    });
  }
  return skipped;
}

export function findRelevantSkips(xml: string): SkippedTest[] {
  return parseSkippedTests(xml).filter((test) => isRelevantFile(test.file));
}

if (import.meta.main) {
  const reportPath = process.argv[2];
  if (reportPath === undefined) {
    console.error("usage: bun scripts/ci/assert-no-db-skips.ts <junit-report.xml>");
    process.exit(2);
  }
  let xml: string;
  try {
    xml = readFileSync(reportPath, "utf8");
  } catch (error) {
    console.error(
      `[db-skip-gate] FAIL: cannot read junit report at ${reportPath}: ${String(error)}`,
    );
    process.exit(2);
  }
  const allSkips = parseSkippedTests(xml);
  const relevantSkips = allSkips.filter((test) => isRelevantFile(test.file));
  if (relevantSkips.length > 0) {
    console.error(
      `[db-skip-gate] FAIL: ${relevantSkips.length} DB-gated test(s) skipped — TEST_DATABASE_URL missing or suite gated out. Inventory:`,
    );
    for (const test of relevantSkips) {
      console.error(`  - ${test.file} :: ${test.classname} :: ${test.name || "(unnamed)"}`);
    }
    process.exit(1);
  }
  console.log(
    `[db-skip-gate] PASS: 0 DB-gated skips (${allSkips.length} irrelevant skip(s) outside gated paths).`,
  );
}
