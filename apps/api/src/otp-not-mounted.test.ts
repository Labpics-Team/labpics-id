import { describe, expect, it } from "bun:test";
import { type AppDeps, createApp } from "./app";
import type { AuthPort } from "./auth/port";
import { loadConfig } from "./config";
import { createLogger } from "./lib/logger";

/**
 * Plan gate "Intermediate-main: no registered production OTP route" (CH08):
 * the production composition must NOT expose the OTP endpoints until the
 * AUTH-01 activation slice. This readback fails the moment someone mounts
 * otpRoutes in createApp ahead of that gate.
 */
function productionShapedDeps(): AppDeps {
  const config = loadConfig({
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    LOG_LEVEL: "fatal",
    CORS_ALLOWED_ORIGINS: "http://localhost:3001",
    REQUEST_TIMEOUT_MS: "5000",
  });
  const auth: AuthPort = { fetch: async () => new Response("auth", { status: 200 }) };
  return {
    config,
    logger: createLogger(config.logLevel),
    database: null,
    auth,
    rateLimit: undefined,
    lifecycleUseCases: undefined,
  };
}

describe("OTP routes are not mounted in the production composition", () => {
  it.each(["/v1/auth/otp/request", "/v1/auth/otp/redeem"])("POST %s returns 404", async (path) => {
    const app = createApp(productionShapedDeps());
    const res = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
