import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDb, createDbPool } from "@labpics/db";
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

    expect(await registerThroughAuthPort(auth)).toBe(200);
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

    const responseStatus = await registerThroughAuthPort(auth, email);

    expect(responseStatus).toBe(200);
    const persisted = await pool.query<{ email: string }>(
      "SELECT email FROM users WHERE email = $1",
      [email],
    );
    expect(persisted.rows).toEqual([{ email }]);
  });
});

async function registerThroughAuthPort(
  auth: AuthPort,
  email = `identity-port-${crypto.randomUUID()}@example.com`,
): Promise<number> {
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
  return response.status;
}
