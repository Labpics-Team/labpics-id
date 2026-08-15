import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static migration-lineage invariants (no database required).
 *
 * Root cause guarded here: a lost drizzle meta snapshot (0004 was renamed to
 * 0005 when two branches landed out of order) made `drizzle-kit generate`
 * diff against a schema state that was missing tables an earlier migration
 * already created, so it re-emitted their `CREATE TABLE`. Applying the
 * journal to a fresh database then fails with `relation ... already exists`
 * — which is exactly how CI runs integration tests.
 *
 * This closes the class at PR time, before any Postgres is involved: no
 * relation (table/type/index/sequence) may be created twice across
 * journal-ordered migrations unless it was dropped in between.
 */
const drizzleDir = join(import.meta.dir, "..", "drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
}

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

function statementsOf(tag: string): string[] {
  const sql = readFileSync(join(drizzleDir, `${tag}.sql`), "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const CREATE_RE =
  /^CREATE\s+(?:UNIQUE\s+)?(TABLE|TYPE|INDEX|SEQUENCE)\s+(?!IF\s+NOT\s+EXISTS)("[^"]+"(?:\."[^"]+")?)/i;
const DROP_RE = /^DROP\s+(TABLE|TYPE|INDEX|SEQUENCE)\s+(?:IF\s+EXISTS\s+)?("[^"]+"(?:\."[^"]+")?)/i;

function relationKey(kind: string, rawName: string): string {
  const name = rawName.replaceAll('"', "").split(".").at(-1) ?? rawName;
  return `${kind.toUpperCase()}:${name}`;
}

describe("drizzle migration lineage", () => {
  const entries = readJournal();

  it("has a SQL file for every journal entry", () => {
    for (const entry of entries) {
      expect(existsSync(join(drizzleDir, `${entry.tag}.sql`)), `missing ${entry.tag}.sql`).toBe(
        true,
      );
    }
  });

  it("never creates the same relation twice without dropping it in between", () => {
    const live = new Map<string, string>();
    for (const entry of entries) {
      for (const statement of statementsOf(entry.tag)) {
        const dropped = DROP_RE.exec(statement);
        if (dropped !== null) {
          live.delete(relationKey(dropped[1] as string, dropped[2] as string));
          continue;
        }
        const created = CREATE_RE.exec(statement);
        if (created === null) continue;
        const key = relationKey(created[1] as string, created[2] as string);
        const firstCreatedIn = live.get(key);
        expect(
          firstCreatedIn,
          `${entry.tag}.sql re-creates ${key} already created by ${firstCreatedIn}.sql; ` +
            "applying the journal to a fresh database would fail with 'already exists'",
        ).toBeUndefined();
        live.set(key, entry.tag);
      }
    }
  });
});
