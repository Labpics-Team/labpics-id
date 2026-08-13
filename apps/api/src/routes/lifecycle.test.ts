import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDb, createDbPool, PostgresRateLimitPort } from "@labpics/db";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { createLogger } from "../lib/logger";
import { UNIFORM_ACCOUNT_RESPONSE } from "./lifecycle";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)(
  "composed anti-enumeration transport contract",
  () => {
    const pool = connectionString === undefined ? null : createDbPool(connectionString);
    beforeAll(async () => {
      if (pool === null) throw new Error("TEST_DATABASE_URL is required");
      await pool.query("TRUNCATE auth_rate_limits, audit_events, outbox");
    });
    afterAll(async () => pool?.end());

    for (const endpoint of [
      "/api/v1/password-reset/request",
      "/api/v1/verification/resend",
    ] as const) {
      for (const email of [
        "existing@example.com",
        "missing@example.com",
        "inactive@example.com",
      ] as const) {
        it(`${endpoint} returns identical full response and invokes use case for ${email}`, async () => {
          if (pool === null) throw new Error("TEST_DATABASE_URL is required");
          let resetCalls = 0;
          let resendCalls = 0;
          const app = createApp({
            config: loadConfig({
              NODE_ENV: "test",
              BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
              LOG_LEVEL: "fatal",
            }),
            logger: createLogger("fatal"),
            database: null,
            auth: { fetch: async () => new Response(null, { status: 204 }) },
            rateLimit: new PostgresRateLimitPort(createDb(pool)),
            lifecycleUseCases: {
              requestPasswordReset: async () => {
                resetCalls += 1;
                return { kind: "accepted" };
              },
              resendVerification: async () => {
                resendCalls += 1;
                return { kind: "accepted" };
              },
            },
          });
          const response = await app.request(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": "source" },
            body: JSON.stringify({ email }),
          });

          expect({
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: await response.json(),
          }).toEqual({
            status: 202,
            contentType: "application/json",
            body: UNIFORM_ACCOUNT_RESPONSE.body,
          });
          expect(endpoint.includes("password-reset") ? resetCalls : resendCalls).toBe(1);
        });
      }
    }
  },
);
