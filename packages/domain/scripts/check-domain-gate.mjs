#!/usr/bin/env bun
/**
 * Dependency gate for architectural source boundaries.
 *
 * Scans TypeScript sources for imports of framework / database / HTTP modules
 * (and node built-ins with external side effects) and fails the build when any
 * is found. The domain package is pure by contract: no framework, no database,
 * no HTTP, no process / filesystem side effects — infrastructure reaches in via
 * ports (see packages/domain/src/ports).
 *
 * Usage: bun scripts/check-domain-gate.mjs [directory]
 * Default directory: repository root. The optional directory is used by hostile
 * fixture tests and is scanned without an allowlist.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repositoryRoot = join(scriptDir, "..", "..", "..");
const defaultTarget = repositoryRoot;
const targetDir = resolve(process.argv[2] ?? defaultTarget);
const isRepositoryScan = targetDir === repositoryRoot;
const AUTH_IMPLEMENTATION_ROOTS = new Set(["better-auth", "@better-auth"]);
const ALLOWLIST = new Set([
  "apps/api/src/auth/better-auth.adapter.ts",
  "apps/api/src/index.ts",
  "packages/db/src/client.ts",
  "packages/db/src/identity-adapter.ts",
  "packages/db/src/schema/access.ts",
  "packages/db/src/schema/audit.ts",
  "packages/db/src/schema/auth.ts",
  "packages/db/src/schema/index.ts",
  "packages/db/src/schema/organization.ts",
  "packages/db/src/schema/protocol.ts",
  "packages/db/src/protocol-adapter.ts",
  "packages/db/src/schema/protocol.ts",
  "packages/db/src/protocol-adapter.ts",
  "packages/db/src/unit-of-work.ts",
  "packages/testkit/src/postgres.ts",
]);

// Package roots forbidden in the domain package, grouped by the categories
// named in the epic: framework, database, http (plus side-effectful builtins).
const FORBIDDEN_ROOTS = new Set([
  // frameworks / web app stacks
  "hono",
  "next",
  "express",
  "fastify",
  "koa",
  "elysia",
  "@elysiajs",
  "svelte",
  "@sveltejs",
  "vue",
  "react",
  "react-dom",
  "@nestjs",
  "nuxt",
  // database / ORM / auth-with-storage
  "drizzle-orm",
  "drizzle-kit",
  "pg",
  "postgres",
  "postgres.js",
  "@prisma",
  "prisma",
  "typeorm",
  "mongoose",
  "knex",
  "kysely",
  "redis",
  "@redis",
  "better-auth",
  "@better-auth",
  "sqlite3",
  "better-sqlite3",
  "mysql2",
  "mongodb",
  // http / network
  "node:http",
  "node:https",
  "node:net",
  "node:dgram",
  "node:tls",
  "node:dns",
  "http",
  "https",
  "http2",
  "undici",
  "axios",
  "node-fetch",
  "ws",
  "eventsource",
  // node builtins with external side effects
  "node:fs",
  "node:path",
  "node:os",
  "node:crypto",
  "node:process",
  "node:child_process",
  "node:worker_threads",
  "node:zlib",
  "fs",
  "path",
  "os",
  "crypto",
  "process",
  "child_process",
]);

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function repositoryFiles() {
  const sourceDirectories = ["apps", "packages"].flatMap((root) => {
    const rootDirectory = join(repositoryRoot, root);
    return readdirSync(rootDirectory)
      .map((entry) => join(rootDirectory, entry, "src"))
      .filter((directory) => statSync(directory, { throwIfNoEntry: false })?.isDirectory());
  });
  return sourceDirectories.flatMap(collectFiles).filter((file) => !file.endsWith(".test.ts"));
}

// Matches module specifiers in static imports, dynamic imports and require().
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)(["'])([^"'\r\n]+?)\1/g;

/** Reduces a specifier to the npm package root (or null for relative imports). */
function moduleRoot(specifier) {
  const s = specifier.trim();
  if (s.startsWith("node:")) {
    const parts = s.split("/");
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  if (s.startsWith(".") || s.startsWith("/")) return null;
  const first = s.split("/")[0];
  if (first === "@") {
    const parts = s.split("/");
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return first;
}

const violations = [];
const files = isRepositoryScan ? repositoryFiles() : collectFiles(targetDir);

for (const file of files) {
  const relative = file.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
  if (isRepositoryScan && ALLOWLIST.has(relative)) continue;
  const source = readFileSync(file, "utf8");
  SPECIFIER_RE.lastIndex = 0;
  while (true) {
    const match = SPECIFIER_RE.exec(source);
    if (match === null) break;
    const root = moduleRoot(match[2]);
    const forbidden = isRepositoryScan ? AUTH_IMPLEMENTATION_ROOTS : FORBIDDEN_ROOTS;
    if (root && forbidden.has(root)) {
      violations.push(`${file}: forbidden import "${match[2]}" (package root "${root}")`);
    }
  }
}

if (violations.length > 0) {
  console.error(`[domain-gate] FAILED — ${violations.length} forbidden import(s):`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(
  `[domain-gate] OK — scanned ${files.length} file(s) under ${targetDir}, no forbidden imports outside ${ALLOWLIST.size} explicit adapter/composition roots.`,
);
