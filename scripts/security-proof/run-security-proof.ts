/**
 * ch02 security proof: mutation/diversion harness.
 *
 * Proves every critical ch02 guard is covered by a test that actually bites:
 * each manifest mutant is applied to a DISPOSABLE temp copy of the workspace
 * (the checkout itself is never mutated), the named test file runs against a
 * FRESH pinned real-PostgreSQL database, and the run must go RED on the
 * expected assertion. A pristine control run of every referenced test file
 * must stay GREEN first, so RED is attributable to the mutant and not to
 * flakiness. Any surviving mutant fails the harness.
 *
 * Usage: TEST_DATABASE_URL=postgres://... bun scripts/security-proof/run-security-proof.ts
 *   [--only <mutant-id>] [--out <report.json>]
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SQL } from "bun";

interface Mutant {
  readonly id: string;
  readonly guard: string;
  readonly origin: "task" | "review";
  readonly sourceOfTruth: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly testFile: string;
  readonly expectedFailingTests: readonly string[];
  readonly runs: number;
}

interface Manifest {
  readonly version: number;
  readonly postgresImage: string;
  readonly mutants: readonly Mutant[];
}

interface MutantResult {
  readonly id: string;
  readonly origin: string;
  readonly status: "killed" | "survived" | "error";
  readonly attempts: number;
  readonly matchedFailingTest: string | null;
  readonly durationMs: number;
  readonly detail: string;
}

const COPY_EXCLUDES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  "build",
  "out",
]);
const TEST_RUN_TIMEOUT_MS = 300_000;

class HarnessError extends Error {
  override readonly name = "HarnessError";
}

function normalize(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function parseArgs(argv: readonly string[]): { only: string | null; out: string | null } {
  let only: string | null = null;
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--only") only = argv[index + 1] ?? null;
    if (argv[index] === "--out") out = argv[index + 1] ?? null;
  }
  return { only, out };
}

function loadManifest(repoRoot: string): Manifest {
  const manifestPath = join(repoRoot, "scripts", "security-proof", "mutants.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (manifest.mutants.length === 0) throw new HarnessError("manifest contains no mutants");
  return manifest;
}

/**
 * Copies the workspace to a disposable temp dir and installs dependencies
 * there. A fresh install is required: linking node_modules back would resolve
 * workspace packages (@labpics/*) to the ORIGINAL sources, making every
 * mutant invisible to the tests.
 */
function createDisposableCopy(repoRoot: string): string {
  const copyRoot = mkdtempSync(join(tmpdir(), "labpics-id-secproof-"));
  cpSync(repoRoot, copyRoot, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(repoRoot.length).replaceAll("\\", "/");
      for (const segment of relative.split("/")) {
        if (COPY_EXCLUDES.has(segment)) return false;
      }
      return true;
    },
  });
  const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
    cwd: copyRoot,
    stdout: "pipe",
    stderr: "pipe",
    timeout: TEST_RUN_TIMEOUT_MS,
  });
  if (install.exitCode !== 0) {
    throw new HarnessError(
      `bun install failed in the disposable copy: ${install.stderr.toString()}`,
    );
  }
  return copyRoot;
}

function applyMutant(copyRoot: string, mutant: Mutant): void {
  const filePath = join(copyRoot, ...mutant.file.split("/"));
  const content = normalize(readFileSync(filePath, "utf8"));
  const occurrences = countOccurrences(content, mutant.find);
  if (occurrences !== 1) {
    throw new HarnessError(
      `${mutant.id}: expected exactly 1 occurrence of the find snippet in ${mutant.file}, found ${occurrences}`,
    );
  }
  writeFileSync(filePath, content.replace(mutant.find, mutant.replace));
}

function restoreMutant(copyRoot: string, repoRoot: string, mutant: Mutant): void {
  const original = readFileSync(join(repoRoot, ...mutant.file.split("/")), "utf8");
  writeFileSync(join(copyRoot, ...mutant.file.split("/")), original);
}

interface TestRun {
  readonly exitCode: number;
  readonly output: string;
  /** True when the pre-test migration failed: the run proves nothing then. */
  readonly migrationFailed: boolean;
  readonly migrationOutput: string;
}

function runNamedTests(copyRoot: string, testFile: string, databaseUrl: string): TestRun {
  // Migrations run from the (possibly mutated) copy through the workspace's
  // own drizzle-kit path (same as CI), so schema mutants are exercised too.
  // A migration failure is reported separately: tests failing on a missing
  // schema must never be classified as a mutant kill.
  const migration = Bun.spawnSync(["bun", "run", "--cwd", "packages/db", "migrate"], {
    cwd: copyRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdout: "pipe",
    stderr: "pipe",
    timeout: TEST_RUN_TIMEOUT_MS,
  });
  const migrationOutput = `${migration.stdout.toString()}\n${migration.stderr.toString()}`;
  if ((migration.exitCode ?? 1) !== 0) {
    return { exitCode: 1, output: "", migrationFailed: true, migrationOutput };
  }
  const result = Bun.spawnSync(["bun", "test", testFile, "--timeout", "120000"], {
    cwd: copyRoot,
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
    stdout: "pipe",
    stderr: "pipe",
    timeout: TEST_RUN_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode ?? 1,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
    migrationFailed: false,
    migrationOutput,
  };
}

function failedTestNames(output: string): readonly string[] {
  return normalize(output)
    .split("\n")
    .filter((line) => line.includes("(fail)") || line.includes("\u2717"));
}

function matchExpectedFailure(output: string, expected: readonly string[]): string | null {
  const failures = failedTestNames(output);
  for (const name of expected) {
    if (failures.some((line) => line.includes(name))) return name;
  }
  return null;
}

async function withFreshDatabase<T>(
  adminUrl: string,
  label: string,
  work: (databaseUrl: string) => Promise<T> | T,
): Promise<T> {
  const databaseName = `secproof_${label}_${crypto.randomUUID().slice(0, 8)}`.replaceAll("-", "_");
  const admin = new SQL(adminUrl);
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${databaseName}`;
    try {
      return await work(databaseUrl.toString());
    } finally {
      await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
  } finally {
    await admin.close();
  }
}

async function runControls(
  copyRoot: string,
  adminUrl: string,
  testFiles: readonly string[],
): Promise<void> {
  // One retry per control absorbs infrastructure flake (e.g. connection
  // timeouts under temp-copy I/O load); a consistent failure still aborts,
  // because RED would then not be attributable to mutants.
  const CONTROL_ATTEMPTS = 2;
  for (const testFile of testFiles) {
    const started = Date.now();
    let lastOutput = "";
    let green = false;
    for (let attempt = 1; attempt <= CONTROL_ATTEMPTS && !green; attempt += 1) {
      const run = await withFreshDatabase(adminUrl, "control", (databaseUrl) =>
        runNamedTests(copyRoot, testFile, databaseUrl),
      );
      green = run.exitCode === 0;
      lastOutput = run.migrationFailed ? run.migrationOutput : run.output;
    }
    if (!green) {
      console.error(lastOutput);
      throw new HarnessError(
        `pristine control run failed for ${testFile}; RED would not be attributable to mutants`,
      );
    }
    console.log(`[control] GREEN ${testFile} (${Date.now() - started}ms)`);
  }
}

async function runMutant(
  copyRoot: string,
  repoRoot: string,
  adminUrl: string,
  mutant: Mutant,
): Promise<MutantResult> {
  const started = Date.now();
  const label = mutant.id.slice(0, 3).toLowerCase();
  try {
    applyMutant(copyRoot, mutant);
    // `runs` > 1 hunts nondeterministic guards (races): the mutant is killed
    // as soon as ONE run goes red on an expected assertion. An unexpected red
    // (infrastructure flake) is retried once before it is declared an error.
    const attempts = Math.max(1, mutant.runs);
    let unexpectedRetryUsed = false;
    let lastUnexpected: string | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const run = await withFreshDatabase(adminUrl, label, (databaseUrl) =>
        runNamedTests(copyRoot, mutant.testFile, databaseUrl),
      );
      if (run.exitCode !== 0) {
        // A failed migration proves nothing about test sensitivity: the named
        // test never ran against the mutated behavior.
        const matched = run.migrationFailed
          ? null
          : matchExpectedFailure(run.output, mutant.expectedFailingTests);
        if (matched === null) {
          lastUnexpected = run.migrationFailed
            ? `migration failed before tests ran: ${run.migrationOutput.slice(-400)}`
            : failedTestNames(run.output).join(" | ");
          if (!unexpectedRetryUsed) {
            unexpectedRetryUsed = true;
            attempt -= 1;
            continue;
          }
          return {
            id: mutant.id,
            origin: mutant.origin,
            status: "error",
            attempts: attempt,
            matchedFailingTest: null,
            durationMs: Date.now() - started,
            detail: `test run went red, but none of the expected assertions failed: ${lastUnexpected}`,
          };
        }
        return {
          id: mutant.id,
          origin: mutant.origin,
          status: "killed",
          attempts: attempt,
          matchedFailingTest: matched,
          durationMs: Date.now() - started,
          detail: `RED as expected on "${matched}"`,
        };
      }
    }
    return {
      id: mutant.id,
      origin: mutant.origin,
      status: "survived",
      attempts,
      matchedFailingTest: null,
      durationMs: Date.now() - started,
      detail: `mutant survived ${attempts} run(s) of ${mutant.testFile}`,
    };
  } finally {
    restoreMutant(copyRoot, repoRoot, mutant);
  }
}

async function main(): Promise<void> {
  const { only, out } = parseArgs(process.argv.slice(2));
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (adminUrl === undefined || adminUrl.trim() === "") {
    throw new HarnessError(
      "TEST_DATABASE_URL is required: point it at the pinned real PostgreSQL 17 instance",
    );
  }
  const repoRoot = resolve(import.meta.dir, "..", "..");
  const manifest = loadManifest(repoRoot);
  const mutants =
    only === null ? manifest.mutants : manifest.mutants.filter((mutant) => mutant.id === only);
  if (mutants.length === 0) throw new HarnessError(`no mutant matches --only ${only}`);

  console.log(`security-proof: ${mutants.length} mutant(s), image ${manifest.postgresImage}`);
  const copyRoot = createDisposableCopy(repoRoot);
  console.log(`disposable copy: ${copyRoot}`);
  const results: MutantResult[] = [];
  try {
    const controlFiles = [...new Set(mutants.map((mutant) => mutant.testFile))];
    await runControls(copyRoot, adminUrl, controlFiles);
    for (const mutant of mutants) {
      const result = await runMutant(copyRoot, repoRoot, adminUrl, mutant);
      results.push(result);
      console.log(
        `[${result.status.toUpperCase()}] ${result.id} (${result.attempts} attempt(s), ${result.durationMs}ms) ${result.detail}`,
      );
    }
  } finally {
    rmSync(copyRoot, { recursive: true, force: true });
  }

  const killed = results.filter((result) => result.status === "killed").length;
  const report = {
    generatedAt: new Date().toISOString(),
    postgresImage: manifest.postgresImage,
    total: results.length,
    killed,
    survived: results.filter((result) => result.status === "survived").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (out !== null) await Bun.write(out, serialized);
  console.log(serialized);
  console.log(`kill ratio: ${killed}/${results.length}`);
  if (killed !== results.length) {
    throw new HarnessError("at least one mutant survived or failed unexpectedly");
  }
}

await main();
