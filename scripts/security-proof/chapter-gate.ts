/**
 * ch02 chapter gate: one command that proves the identity chapter on the real
 * composition path.
 *
 * Order: full suite on pinned real PostgreSQL with ZERO skipped tests ->
 * domain dependency gate -> typecheck -> build -> mutation/diversion proof ->
 * live smoke (/health, /ready, /api/v1/ping) against the BUILT service
 * composition root connected to the same database.
 *
 * Usage: TEST_DATABASE_URL=postgres://... bun scripts/security-proof/chapter-gate.ts
 */
import { join, resolve } from "node:path";

// Bun prints summary lines like " 3 skip" / " 1 todo"; only a non-zero count
// on its own summary line is a violation ("0 skip" is a healthy summary).
const SKIP_SUMMARY_RE = /^\s*[1-9]\d*\s+(?:skip|todo)\b/m;
const STEP_TIMEOUT_MS = 900_000;

class GateError extends Error {
  override readonly name = "GateError";
}

const repoRoot = resolve(import.meta.dir, "..", "..");
const adminUrl = process.env.TEST_DATABASE_URL;
if (adminUrl === undefined || adminUrl.trim() === "") {
  throw new GateError("TEST_DATABASE_URL is required for the chapter gate");
}

interface StepRun {
  readonly exitCode: number;
  readonly output: string;
}

function run(command: readonly string[], env: Record<string, string | undefined> = {}): StepRun {
  const result = Bun.spawnSync([...command], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: STEP_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode ?? 1,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  };
}

function step(name: string, work: () => StepRun, verify?: (output: string) => void): void {
  const started = Date.now();
  const result = work();
  if (result.exitCode !== 0) {
    console.error(result.output);
    throw new GateError(`gate step failed: ${name}`);
  }
  verify?.(result.output);
  console.log(`[gate] PASS ${name} (${Date.now() - started}ms)`);
}

function assertZeroSkips(output: string): void {
  const summary = output.match(SKIP_SUMMARY_RE);
  if (summary !== null) {
    throw new GateError(
      `the chapter gate forbids skipped tests, found "${summary[0]}" in the summary`,
    );
  }
}

async function smokeBuiltComposition(): Promise<void> {
  const port = 3000 + Math.floor(Math.random() * 2000);
  const server = Bun.spawn(["bun", join("apps", "api", "dist", "index.js")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: adminUrl,
      BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      BETTER_AUTH_PERSISTENCE: "postgres",
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      CORS_ALLOWED_ORIGINS: "https://id.lab.pics",
      LOG_LEVEL: "warn",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  // Drain both pipes eagerly: an unread pipe can fill and block the child,
  // and the captured output is the only startup-failure evidence.
  const stdoutText = new Response(server.stdout).text();
  const stderrText = new Response(server.stderr).text();
  const smoke = async (path: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5_000) });
  try {
    const deadline = Date.now() + 30_000;
    let lastError = "service did not answer before the deadline";
    while (Date.now() < deadline) {
      try {
        const health = await smoke("/health");
        const ready = await smoke("/ready");
        const ping = await smoke("/api/v1/ping");
        if (health.status === 200 && ready.status === 200 && ping.status === 200) {
          const readyBody = (await ready.json()) as { status: string; database: string };
          if (readyBody.status !== "ready" || readyBody.database !== "up") {
            throw new GateError(`/ready contract mismatch: ${JSON.stringify(readyBody)}`);
          }
          console.log("[gate] PASS live smoke: /health=200 /ready=200(up) /api/v1/ping=200");
          return;
        }
        lastError = `statuses health=${health.status} ready=${ready.status} ping=${ping.status}`;
      } catch (error) {
        if (error instanceof GateError) throw error;
        lastError = error instanceof Error ? error.message : String(error);
      }
      await Bun.sleep(500);
    }
    server.kill();
    console.error(await stdoutText);
    console.error(await stderrText);
    throw new GateError(`live smoke failed against the built composition: ${lastError}`);
  } finally {
    server.kill();
    await server.exited;
  }
}

step(
  "full suite on pinned real PostgreSQL (zero skips)",
  () => run(["bun", "test", "--timeout", "120000"], { TEST_DATABASE_URL: adminUrl }),
  assertZeroSkips,
);
step("domain dependency gate", () => run(["bun", "run", "check:domain-gate"]));
step("typecheck all workspaces", () => run(["bun", "run", "typecheck"]));
step("build API, web, and packages", () => run(["bun", "run", "build"]));
step("mutation/diversion security proof", () =>
  run(["bun", join("scripts", "security-proof", "run-security-proof.ts")], {
    TEST_DATABASE_URL: adminUrl,
  }),
);
await smokeBuiltComposition();
console.log("[gate] ch02 chapter gate PASSED");
