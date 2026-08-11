import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schemaDir = join(import.meta.dir, "..", "src", "schema");
const platformSchemas = ["organization.ts", "access.ts", "audit.ts"] as const;
const AUTH_SCHEMA_IMPORT_RE = /from\s*["'][^"']*auth["']/;

describe("database schema ownership boundaries", () => {
  it("keeps platform-owned schemas independent from provider-owned authentication tables", () => {
    for (const file of platformSchemas) {
      const source = readFileSync(join(schemaDir, file), "utf8");
      expect(
        source,
        `${file} must store opaque identity references without importing auth tables`,
      ).not.toMatch(AUTH_SCHEMA_IMPORT_RE);
    }
  });
});
