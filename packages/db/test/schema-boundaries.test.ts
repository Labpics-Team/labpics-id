import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { accounts, member, role, sessions, users } from "../src";

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

  it("keeps one canonical identity subject table for provider persistence", () => {
    expect(getTableConfig(users).name).toBe("users");
    expect(getTableConfig(sessions).foreignKeys).toHaveLength(1);
    expect(getTableConfig(accounts).foreignKeys).toHaveLength(1);
  });

  it("preserves the tenant-safe composite membership role foreign key", () => {
    const membershipForeignKey = getTableConfig(member).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === "member_organization_role_fk",
    );
    const roleConfig = getTableConfig(role);

    expect(membershipForeignKey).toBeDefined();
    expect(roleConfig.uniqueConstraints).toHaveLength(0);
    expect(
      roleConfig.indexes.some((index) => index.config.name === "role_organization_id_unique"),
    ).toBe(true);
  });
});
