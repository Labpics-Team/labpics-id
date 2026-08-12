import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createIdentityUseCases, Email } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresIdentityAdapter, PostgresUnitOfWork } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("account lifecycle", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);

  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  afterAll(async () => pool?.end());

  it("normalizes uniqueness and rejects sign-in until single-use verification", async () => {
    const harness = createHarness();
    const email = Email.from(`USER-${crypto.randomUUID()}@Example.com`);
    expect(
      await harness.useCases.register({
        email,
        name: "User",
        password: "correct horse battery staple",
      }),
    ).toMatchObject({ kind: "accepted" });
    expect(
      await harness.useCases.register({
        email: Email.from(`  ${email.toString().toUpperCase()}  `),
        name: "Duplicate",
        password: "correct horse battery staple",
      }),
    ).toEqual({ kind: "rejected", error: { kind: "conflict" } });
    expect(harness.notifications.filter((item) => item.kind === "email_verification")).toHaveLength(
      1,
    );
    expect(
      await harness.useCases.signIn({ email, password: "correct horse battery staple" }),
    ).toEqual({ kind: "rejected", error: { kind: "unverified_email" } });
    const token = harness.token("email_verification");
    expect(await harness.useCases.verifyEmail({ token })).toMatchObject({ kind: "accepted" });
    expect(await harness.useCases.verifyEmail({ token })).toEqual({
      kind: "rejected",
      error: { kind: "invalid_token" },
    });
    expect(
      await harness.useCases.signIn({ email, password: "correct horse battery staple" }),
    ).toMatchObject({ kind: "accepted" });
  });

  it("allows exactly one concurrent verification token consumer", async () => {
    const harness = createHarness();
    const email = Email.from(`race-${crypto.randomUUID()}@example.com`);
    await harness.useCases.register({
      email,
      name: "Race",
      password: "correct horse battery staple",
    });
    const token = harness.token("email_verification");
    const results = await Promise.all([
      harness.useCases.verifyEmail({ token }),
      harness.useCases.verifyEmail({ token }),
    ]);
    expect(results.filter((result) => result.kind === "accepted")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "rejected")).toHaveLength(1);
  });

  it("keeps reset requests uniform and revokes prior sessions after reset", async () => {
    const harness = createHarness();
    const email = Email.from(`reset-${crypto.randomUUID()}@example.com`);
    const missing = Email.from(`missing-${crypto.randomUUID()}@example.com`);
    await harness.useCases.register({
      email,
      name: "Reset",
      password: "correct horse battery staple",
    });
    await harness.useCases.verifyEmail({ token: harness.token("email_verification") });
    const signedIn = await harness.useCases.signIn({
      email,
      password: "correct horse battery staple",
    });
    if (signedIn.kind !== "accepted") throw new Error("expected session before reset");
    expect(await harness.useCases.requestPasswordReset({ email })).toEqual({
      kind: "accepted",
      value: undefined,
    });
    expect(await harness.useCases.requestPasswordReset({ email: missing })).toEqual({
      kind: "accepted",
      value: undefined,
    });
    expect(harness.notifications.filter((item) => item.kind === "password_reset")).toHaveLength(1);
    const durableIntent = await pool?.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox WHERE type = 'identity.password_reset_requested' AND payload -> 'payload' ->> 'subjectId' IS NOT NULL",
    );
    expect(durableIntent?.rows[0]?.count).toBeGreaterThan(0);
    const token = harness.token("password_reset");
    const persistedToken = await pool?.query<{ value: string }>(
      "SELECT value FROM verification_tokens WHERE identifier LIKE 'password_reset:%' ORDER BY created_at DESC LIMIT 1",
    );
    expect(persistedToken?.rows[0]?.value).toBe(`digest:${token}`);
    expect(persistedToken?.rows[0]?.value).not.toBe(token);
    expect(
      await harness.useCases.resetPassword({
        token,
        newPassword: "new correct horse battery staple",
      }),
    ).toEqual({ kind: "accepted", value: undefined });
    const session = await pool?.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM sessions WHERE id = $1",
      [signedIn.value.id],
    );
    expect(session?.rows[0]?.revoked_at).toBeInstanceOf(Date);
    expect(
      await harness.useCases.resetPassword({
        token,
        newPassword: "again correct horse battery staple",
      }),
    ).toEqual({ kind: "rejected", error: { kind: "invalid_token" } });
    expect(
      await harness.useCases.signIn({ email, password: "correct horse battery staple" }),
    ).toEqual({ kind: "rejected", error: { kind: "invalid_credentials" } });
    expect(
      await harness.useCases.signIn({ email, password: "new correct horse battery staple" }),
    ).toMatchObject({ kind: "accepted" });
    const leaked = await pool?.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events
       WHERE concat_ws(' ', actor_id, action, target_type, target_id, coalesce(ip, ''), coalesce(user_agent, '')) LIKE $1
          OR concat_ws(' ', actor_id, action, target_type, target_id, coalesce(ip, ''), coalesce(user_agent, '')) LIKE $2`,
      [`%${token}%`, "%new correct horse battery staple%"],
    );
    expect(leaked?.rows[0]?.count).toBe(0);
    const auditRows = await pool?.query<{
      actor_id: string;
      action: string;
      target_type: string;
      target_id: string;
      ip: string | null;
      user_agent: string | null;
    }>(
      "SELECT actor_id, action, target_type, target_id, ip, user_agent FROM audit_events WHERE target_id = $1",
      [signedIn.value.subjectId],
    );
    expect(auditRows?.rows.length).toBeGreaterThan(0);
    for (const row of auditRows?.rows ?? []) {
      expect(JSON.stringify(row)).not.toContain(token);
      expect(JSON.stringify(row)).not.toContain("new correct horse battery staple");
    }
  });

  function createHarness() {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const adapter = new PostgresIdentityAdapter();
    const issued = new Map<string, string>();
    const notifications: { readonly kind: "email_verification" | "password_reset" }[] = [];
    return {
      useCases: createIdentityUseCases({
        repository: adapter,
        credentials: adapter,
        clock: { now: () => new Date("2026-08-12T00:00:00.000Z") },
        tokens: {
          issue: async ({ purpose }) => {
            const raw = `${purpose}-${crypto.randomUUID()}`;
            issued.set(purpose, raw);
            return {
              raw,
              digest: `digest:${raw}`,
              expiresAt: new Date("2026-08-13T00:00:00.000Z"),
            };
          },
          digest: async (raw) => `digest:${raw}`,
        },
        notifications: {
          enqueue: async (notification) => {
            notifications.push(notification);
          },
        },
        rateLimit: { consume: async () => ({ kind: "allowed" }) },
        audit: adapter,
        outbox: adapter,
        protocolRevocation: adapter,
        unitOfWork: new PostgresUnitOfWork(createDb(pool)),
      }),
      token: (purpose: string) => issued.get(purpose) ?? "missing-token",
      notifications,
    };
  }
});
