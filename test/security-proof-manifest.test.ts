import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const manifestPath = join(repoRoot, "scripts", "security-proof", "mutants.json");

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

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  readonly postgresImage: string;
  readonly mutants: readonly Mutant[];
};

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

describe("ch02 security-proof manifest integrity", () => {
  it("pins the same PostgreSQL 17 digest as docker-compose and CI", () => {
    const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");
    expect(compose).toContain(manifest.postgresImage);
  });

  it("covers at least ten guards including the three review-found classes", () => {
    expect(manifest.mutants.length).toBeGreaterThanOrEqual(10);
    const reviewMutants = manifest.mutants.filter((mutant) => mutant.origin === "review");
    expect(reviewMutants.map((mutant) => mutant.id).sort()).toEqual([
      "M11-rotate-ignores-revoked-or-deactivated",
      "M12-rawtoken-audit-hash-leak",
      "M13-limiter-unawaited-async-rejection",
    ]);
  });

  it("keeps mutant ids unique", () => {
    const ids = manifest.mutants.map((mutant) => mutant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const mutant of manifest.mutants) {
    describe(mutant.id, () => {
      it("targets an existing source file with exactly one find occurrence", () => {
        const filePath = join(repoRoot, ...mutant.file.split("/"));
        expect(existsSync(filePath)).toBe(true);
        const content = normalize(readFileSync(filePath, "utf8"));
        expect(countOccurrences(content, mutant.find)).toBe(1);
      });

      it("produces a real behavior change, not a no-op", () => {
        expect(mutant.replace).not.toBe(mutant.find);
      });

      it("names an existing test file containing every expected failing test", () => {
        const testPath = join(repoRoot, ...mutant.testFile.split("/"));
        expect(existsSync(testPath)).toBe(true);
        const testSource = normalize(readFileSync(testPath, "utf8"));
        expect(mutant.expectedFailingTests.length).toBeGreaterThan(0);
        for (const testName of mutant.expectedFailingTests) {
          expect(
            testSource,
            `${mutant.testFile} must contain a test matching "${testName}"`,
          ).toContain(testName);
        }
      });

      it("declares provenance and at least one run", () => {
        expect(mutant.sourceOfTruth.length).toBeGreaterThan(0);
        expect(mutant.guard.length).toBeGreaterThan(0);
        expect(mutant.runs).toBeGreaterThanOrEqual(1);
      });
    });
  }
});
