import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "..", "scripts", "check-domain-gate.mjs");
const repositoryRoot = join(import.meta.dir, "..", "..", "..");

describe("domain dependency gate", () => {
  it("passes on the current domain source", () => {
    const res = spawnSync("bun", [script], { encoding: "utf8" });
    expect(res.status).toBe(0);
  });

  it.each([
    ['import { Hono } from "hono";', "hono"],
    ['import { drizzle } from "drizzle-orm/node-postgres";', "drizzle-orm"],
    ['import pg from "pg";', "pg"],
    ['import { betterAuth } from "better-auth";', "better-auth"],
    ['import http from "node:http";', "node:http"],
    ['const x = await import("axios");', "axios"],
    ['require("express");', "express"],
    ['import { readFileSync } from "node:fs";', "node:fs"],
  ])("fails on %s", (source, needle) => {
    const dir = mkdtempSync(join(tmpdir(), "domain-gate-"));
    try {
      writeFileSync(join(dir, "bad.ts"), `${source}\n`);
      const res = spawnSync("bun", [script, dir], { encoding: "utf8" });
      expect(res.status).toBe(1);
      const output = `${res.stdout}${res.stderr}`;
      expect(output).toContain(needle);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates a hostile fixture failure through the root script", () => {
    const dir = mkdtempSync(join(tmpdir(), "domain-gate-root-"));
    try {
      writeFileSync(join(dir, "bad.ts"), 'import { Hono } from "hono";\n');
      const res = spawnSync("bun", ["run", "check:domain-gate", "--", dir], {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
      expect(res.status).toBe(1);
      expect(`${res.stdout}${res.stderr}`).toContain("hono");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
