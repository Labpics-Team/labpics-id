import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDb, createDbPool, PostgresIdentityAdapter, PostgresUnitOfWork } from "@labpics/db";
import type { IssueTokenCommand } from "../../../../packages/domain/src";
import { createIdentityUseCases } from "../../../../packages/domain/src";
import { runIdentityUseCaseContract } from "../../../../packages/domain/test/identity-contract-harness";
import { ConfigError } from "../config";
import { createBetterAuthPort } from "./better-auth.adapter";
import type { AuthPort } from "./port";

describe("Better Auth adapter safety", () => {
  it("rejects the memory adapter in production before serving a request", () => {
    expect(() =>
      createBetterAuthPort({
        runtime: "production",
        persistence: "memory",
        database: undefined,
        secret: "a-production-secret-with-more-than-32-characters",
        baseUrl: "https://id.lab.pics",
        trustedOrigins: ["https://id.lab.pics"],
      }),
    ).toThrow(ConfigError);
  });

  it("rejects durable authentication persistence without a database", () => {
    expect(() =>
      createBetterAuthPort({
        runtime: "test",
        persistence: "postgres",
        database: undefined,
        secret: "a-test-secret-with-more-than-32-characters",
        baseUrl: undefined,
        trustedOrigins: ["http://localhost:3001"],
      }),
    ).toThrow(ConfigError);
  });

  it("satisfies the registration contract with the in-memory adapter", async () => {
    const auth = createBetterAuthPort({
      runtime: "test",
      persistence: "memory",
      database: undefined,
      secret: "a-test-secret-with-more-than-32-characters",
      baseUrl: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3001"],
    });

    expect((await registerThroughAuthPort(auth)).status).toBe(200);
  });
});

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("Better Auth Postgres adapter contract", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);

  beforeAll(async () => {
    if (pool === null) throw new ConfigError("TEST_DATABASE_URL is required");
    await pool.query("SELECT 1 FROM users LIMIT 1");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists registration through the durable adapter without changing the HTTP port", async () => {
    if (pool === null) throw new ConfigError("TEST_DATABASE_URL is required");
    const email = `identity-port-${crypto.randomUUID()}@example.com`;
    const auth = createBetterAuthPort({
      runtime: "test",
      persistence: "postgres",
      database: createDb(pool),
      secret: "a-test-secret-with-more-than-32-characters",
      baseUrl: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3001"],
    });

    const response = await registerThroughAuthPort(auth, email);

    expect(response.status).toBe(200);
    const persisted = await pool.query<{ email: string }>(
      "SELECT email FROM users WHERE email = $1",
      [email],
    );
    expect(persisted.rows).toEqual([{ email }]);
    const sessionSecurity = await pool.query<{
      last_active_at: Date | null;
      absolute_expires_at: Date | null;
      refresh_count: number;
    }>(
      `SELECT s.last_active_at, s.absolute_expires_at,
        (SELECT count(*)::int FROM session_refresh_credentials r WHERE r.session_id = s.id) AS refresh_count
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
      [email],
    );
    expect(sessionSecurity.rows[0]?.last_active_at).toBeInstanceOf(Date);
    expect(sessionSecurity.rows[0]?.absolute_expires_at).toBeInstanceOf(Date);
    expect(sessionSecurity.rows[0]?.refresh_count).toBe(1);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("Domain=");
  });

  it("runs the shared identity use-case contract through the Postgres adapter", async () => {
    if (pool === null) throw new ConfigError("TEST_DATABASE_URL is required");
    const adapter = new PostgresIdentityAdapter();
    const issued = new Map<string, string>();
    const useCases = createIdentityUseCases({
      repository: adapter,
      credentials: adapter,
      clock: { now: () => new Date("2026-08-12T00:00:00.000Z") },
      tokens: {
        issue: async ({ purpose }: IssueTokenCommand) => {
          const raw = `${purpose}-${crypto.randomUUID()}`;
          issued.set(purpose, raw);
          return {
            raw,
            digest: raw,
            expiresAt: new Date("2026-08-13T00:00:00.000Z"),
          };
        },
        digest: async (raw: string) => raw,
      },
      notifications: { enqueue: async () => undefined },
      rateLimit: { consume: async () => ({ kind: "allowed" }) },
      audit: adapter,
      outbox: adapter,
      protocolRevocation: adapter,
      unitOfWork: new PostgresUnitOfWork(createDb(pool)),
    });

    await runIdentityUseCaseContract({
      useCases,
      token: (kind) => issued.get(kind) ?? "missing-token",
    });
  });
});

async function registerThroughAuthPort(
  auth: AuthPort,
  email = `identity-port-${crypto.randomUUID()}@example.com`,
): Promise<Response> {
  const response = await auth.fetch(
    new Request("http://localhost:3000/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3001" },
      body: JSON.stringify({
        email,
        name: "Identity Port",
        password: "correct horse battery staple",
      }),
    }),
  );
  return response;
}
