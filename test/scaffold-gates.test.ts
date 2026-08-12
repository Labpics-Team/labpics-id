import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  ".git",
  "drizzle",
  ".turbo",
]);

// Character classes break self-matching: this file must never trip the scans
// it defines.
const AS_ANY_RE = /\bas\s+any\b/;
const TS_IGNORE_RE = /@[t]s-ignore/;
const TS_NOCHECK_RE = /@[t]s-nocheck/;
const STALE_ARCHITECTURE_TERMS = [
  new RegExp(["modular", "monolith"].join("[-\\s]+"), "i"),
  new RegExp(["Better", "Auth", "provider"].join("[\\W_]*"), "i"),
  new RegExp(["exactly", "once"].join("[\\W_]*"), "i"),
] as const;
const G20_NODE_PROCESS_RE =
  /G20[\s\S]{0,200}(?:(?:process|процесс)[\s\S]{0,100}Node LTS|Node LTS[\s\S]{0,100}(?:process|процесс))/i;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("repo scaffold gates", () => {
  it("has no suppressed type escapes in committed sources", () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles(repoRoot)) {
      const source = readFileSync(file, "utf8");
      if (AS_ANY_RE.test(source)) violations.push(`${file}: uses 'as' plus 'any'`);
      if (TS_IGNORE_RE.test(source)) violations.push(`${file}: uses ts-ignore directive`);
      if (TS_NOCHECK_RE.test(source)) violations.push(`${file}: uses ts-nocheck directive`);
    }
    expect(violations).toEqual([]);
  });

  it("commits a bun.lock (single package manager is bun)", () => {
    expect(existsSync(join(repoRoot, "bun.lock"))).toBe(true);
  });

  it("keeps .env.example placeholder-only", () => {
    const env = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(env).toContain("replace-me");
    // No high-entropy-looking tokens (hex / base64-style) that would indicate a
    // real secret was committed.
    expect(env).not.toMatch(/[a-f0-9]{32}/i);
    expect(env).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });

  it("publishes local Postgres only on the IPv4 loopback interface", () => {
    const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");
    const document = Bun.YAML.parse(compose);
    expect(document).toEqual(
      expect.objectContaining({
        services: expect.objectContaining({
          postgres: expect.objectContaining({ ports: ["127.0.0.1:54310:5432"] }),
        }),
      }),
    );
  });

  it("keeps architecture, threat model, and schema comments aligned with G20 and outbox delivery", () => {
    const architecture = readFileSync(join(repoRoot, "docs", "architecture.md"), "utf8");
    const threatModel = readFileSync(join(repoRoot, "docs", "security", "threat-model.md"), "utf8");
    const auditSchema = readFileSync(
      join(repoRoot, "packages", "db", "src", "schema", "audit.ts"),
      "utf8",
    );
    const contracts = [architecture, threatModel, auditSchema];
    const governedFiles = [
      architecture,
      threatModel,
      auditSchema,
      readFileSync(join(repoRoot, "apps", "api", "package.json"), "utf8"),
      readFileSync(join(repoRoot, "packages", "domain", "src", "ports", "outbox.ts"), "utf8"),
    ];

    expect(architecture).toMatch(G20_NODE_PROCESS_RE);
    expect(threatModel).toMatch(G20_NODE_PROCESS_RE);
    expect(architecture).toMatch(/Node LTS Protocol\s+adapter на `oidc-provider`/i);
    expect(threatModel).toMatch(
      /`oidc-provider`[\s\S]{0,180}Bun core не становится\s+protocol provider/i,
    );
    expect(architecture).toMatch(/один публичный\s+issuer/i);
    expect(architecture).toMatch(/отдельный публичный issuer или client registry\s+запрещён/i);
    expect(threatModel).toMatch(/не получает второй writable identity SSOT/i);
    for (const contract of contracts) {
      expect(contract).toMatch(/at-least-once/i);
      expect(contract).toMatch(/idempoten(?:t|cy)/i);
    }
    for (const governedFile of governedFiles)
      for (const staleTerm of STALE_ARCHITECTURE_TERMS) expect(governedFile).not.toMatch(staleTerm);
  });
});
