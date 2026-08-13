import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresRateLimitPort } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("shared abuse controls", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  afterAll(async () => pool?.end());

  it("shares the budget across two application instances", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const now = () => new Date("2026-08-12T00:00:00Z");
    const first = new PostgresRateLimitPort(createDb(pool), now);
    const second = new PostgresRateLimitPort(createDb(pool), now);
    const key = crypto.randomUUID();
    expect(await first.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await second.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await first.consume({ action: "sign_in", key })).toEqual({ kind: "allowed" });
    expect(await second.consume({ action: "sign_in", key })).toMatchObject({ kind: "limited" });
  });

  it("fails closed when the shared store is unavailable", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const limiter = new PostgresRateLimitPort(createDb(pool), undefined, async () => {
      throw new Error("shared store unavailable");
    });
    expect(await limiter.consume({ action: "password_reset", key: "source" })).toMatchObject({
      kind: "limited",
    });
  });
});
