import { describe, expect, it } from "bun:test";
import { ConfigError, loadConfig } from "./config";

const validSecret = "unique-configured-secret-with-at-least-32-characters";

describe("authentication configuration", () => {
  it("fails closed when production has no authentication secret", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://id.lab.pics" }),
    ).toThrow(ConfigError);
  });

  it("rejects authentication secrets shorter than 32 characters", () => {
    expect(() => loadConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: "too-short" })).toThrow(
      ConfigError,
    );
  });

  it("accepts an explicitly configured authentication secret", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: validSecret,
      CORS_ALLOWED_ORIGINS: "https://id.lab.pics",
    });

    expect(config.authSecret).toBe(validSecret);
  });

  it.each([
    "dev-only-insecure-secret-change-me",
    "replace-me-with-a-32-byte-random-secret",
    "test-only-secret-with-at-least-32-characters",
  ])("rejects the known fallback secret %s in production", (secret) => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: secret,
        CORS_ALLOWED_ORIGINS: "https://id.lab.pics",
      }),
    ).toThrow(ConfigError);
  });

  it("trims an explicitly configured authentication secret", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: `  ${validSecret}  `,
    });

    expect(config.authSecret).toBe(validSecret);
  });
});

describe("CORS origin configuration", () => {
  it.each([
    "*",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?query=1",
    "https://example.com#fragment",
    "ftp://example.com",
    "not-an-origin",
    "https://example.com,https://example.com",
  ])("rejects non-canonical origin list %s", (origins) => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: validSecret,
        CORS_ALLOWED_ORIGINS: origins,
      }),
    ).toThrow(ConfigError);
  });

  it("requires an explicit production allowlist", () => {
    expect(() => loadConfig({ NODE_ENV: "production", BETTER_AUTH_SECRET: validSecret })).toThrow(
      ConfigError,
    );
  });
});
