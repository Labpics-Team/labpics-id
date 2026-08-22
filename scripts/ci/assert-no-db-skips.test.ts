import { describe, expect, it } from "bun:test";
import { findRelevantSkips, isRelevantFile, parseSkippedTests } from "./assert-no-db-skips";

function junit(testcases: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" failures="0">
  <testsuite name="fixture" file="fixture.ts">
${testcases}
  </testsuite>
</testsuites>`;
}

describe("assert-no-db-skips junit parsing", () => {
  it("extracts skipped testcases including self-closing passes", () => {
    const xml = junit(`
      <testcase name="runs fine" classname="suite" file="packages\\db\\test\\abuse-controls.integration.test.ts" />
      <testcase name="shares the budget" classname="shared abuse controls" file="packages\\db\\test\\abuse-controls.integration.test.ts">
        <skipped />
      </testcase>
      <testcase name="(unnamed)" classname="shared abuse controls" file="packages\\db\\test\\abuse-controls.integration.test.ts">
        <skipped />
      </testcase>`);
    const skipped = parseSkippedTests(xml);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toEqual({
      file: "packages/db/test/abuse-controls.integration.test.ts",
      classname: "shared abuse controls",
      name: "shares the budget",
    });
  });

  it("decodes XML entities in attributes", () => {
    const xml = junit(`
      <testcase name="a &amp; b &lt;ok&gt;" classname="s" file="packages/db/test/x.integration.test.ts">
        <skipped />
      </testcase>`);
    expect(parseSkippedTests(xml)[0]?.name).toBe("a & b <ok>");
  });

  it("returns empty for a report without skips", () => {
    const xml = junit(
      `<testcase name="ok" classname="s" file="packages/db/test/migrate.test.ts" />`,
    );
    expect(parseSkippedTests(xml)).toHaveLength(0);
  });
});

describe("relevance classification", () => {
  it("flags packages/db/test files regardless of suffix", () => {
    expect(isRelevantFile("packages\\db\\test\\migrate.test.ts")).toBe(true);
    expect(isRelevantFile("packages/db/test/schema-boundaries.test.ts")).toBe(true);
  });

  it("flags *.integration.test.ts anywhere in the tree", () => {
    expect(isRelevantFile("apps/api/src/some-future.integration.test.ts")).toBe(true);
  });

  it("flags known DB-gated app test files", () => {
    expect(isRelevantFile("apps\\api\\src\\app.test.ts")).toBe(true);
    expect(isRelevantFile("apps/api/src/routes/lifecycle.test.ts")).toBe(true);
    expect(isRelevantFile("apps/api/src/auth/better-auth.adapter.test.ts")).toBe(true);
  });

  it("ignores unrelated skips (protocol smoke under bun)", () => {
    expect(isRelevantFile("apps/protocol/test/discovery-smoke.test.ts")).toBe(false);
    expect(isRelevantFile("packages/domain/test/contract.test.ts")).toBe(false);
  });
});

describe("gate verdict", () => {
  it("fails when a DB-gated suite is skipped (missing TEST_DATABASE_URL shape)", () => {
    const xml = junit(`
      <testcase name="commits rows together" classname="PostgresUnitOfWork" file="packages\\db\\test\\unit-of-work.integration.test.ts">
        <skipped />
      </testcase>
      <testcase name="bun smoke" classname="discovery" file="apps\\protocol\\test\\discovery-smoke.test.ts">
        <skipped />
      </testcase>`);
    const relevant = findRelevantSkips(xml);
    expect(relevant).toHaveLength(1);
    expect(relevant[0]?.file).toBe("packages/db/test/unit-of-work.integration.test.ts");
  });

  it("passes when only irrelevant skips exist", () => {
    const xml = junit(`
      <testcase name="bun smoke" classname="discovery" file="apps\\protocol\\test\\discovery-smoke.test.ts">
        <skipped />
      </testcase>`);
    expect(findRelevantSkips(xml)).toHaveLength(0);
  });
});
