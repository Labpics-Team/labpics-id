import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { userId } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresSessionSecurityAdapter } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("first-party session security", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  const now = new Date("2026-08-12T00:00:00.000Z");

  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });

  afterAll(async () => pool?.end());

  it("rotates once and revokes the whole family on sequential replay", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const fixture = await adapter.createFixture(userId(`subject-${crypto.randomUUID()}`), now);
    const rotated = await adapter.rotate(fixture.refreshToken, now);
    const replay = await adapter.rotate(fixture.refreshToken, now);

    expect(rotated.kind).toBe("rotated");
    expect(replay).toEqual({ kind: "replay", familyId: fixture.familyId });
    expect(
      await adapter.resolve(rotated.kind === "rotated" ? rotated.refreshToken : "", now),
    ).toEqual({
      kind: "revoked",
    });
    expect(await adapter.securityEventCount(fixture.familyId)).toBe(1);
  });

  it("permits one concurrent redemption and then revokes the family", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const fixture = await adapter.createFixture(userId(`subject-${crypto.randomUUID()}`), now);
    const results = await Promise.all([
      adapter.rotate(fixture.refreshToken, now),
      adapter.rotate(fixture.refreshToken, now),
    ]);

    expect(results.filter((result) => result.kind === "rotated")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "replay")).toHaveLength(1);
    expect(await adapter.activeFamilyCount(fixture.familyId)).toBe(0);
  });

  it("enforces idle and absolute expiry from authoritative state", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const fixture = await adapter.createFixture(userId(`subject-${crypto.randomUUID()}`), now);

    expect(
      await adapter.resolve(fixture.refreshToken, new Date("2026-08-12T00:14:59.000Z")),
    ).toMatchObject({
      kind: "active",
    });
    expect(
      await adapter.resolve(fixture.refreshToken, new Date("2026-08-12T00:15:01.000Z")),
    ).toEqual({
      kind: "expired",
    });
    await adapter.touch(fixture.sessionId, new Date("2026-08-12T00:14:00.000Z"));
    expect(
      await adapter.resolve(fixture.refreshToken, new Date("2026-08-12T01:00:01.000Z")),
    ).toEqual({
      kind: "expired",
    });
  });

  it("revokes one, logout-all, password-change, and deactivation immediately", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const subjectId = userId(`subject-${crypto.randomUUID()}`);
    const first = await adapter.createFixture(subjectId, now);
    const second = await adapter.createFixture(subjectId, now);

    await adapter.revokeOne(first.sessionId, now);
    expect(await adapter.list(subjectId, now)).toHaveLength(1);
    await adapter.logoutAll(subjectId, now, "password_change");
    expect(await adapter.list(subjectId, now)).toHaveLength(0);
    const third = await adapter.createFixture(subjectId, now);
    await adapter.deactivate(subjectId, now);
    expect(await adapter.resolve(third.refreshToken, now)).toEqual({ kind: "revoked" });
    expect(await adapter.protocolSignalCount(subjectId)).toBe(1);
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it("rejects rotation after password-change logout-all", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const subjectId = userId(`subject-${crypto.randomUUID()}`);
    const fixture = await adapter.createFixture(subjectId, now);
    await adapter.logoutAll(subjectId, now, "password_change");

    expect(await adapter.rotate(fixture.refreshToken, now)).toEqual({ kind: "revoked" });
  });

  it("rejects rotation after subject deactivation", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresSessionSecurityAdapter(createDb(pool));
    const subjectId = userId(`subject-${crypto.randomUUID()}`);
    const fixture = await adapter.createFixture(subjectId, now);
    await adapter.deactivate(subjectId, now);

    expect(await adapter.rotate(fixture.refreshToken, now)).toEqual({ kind: "revoked" });
  });
});
