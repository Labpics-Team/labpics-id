import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, ProtocolConfigError } from "../src/config.ts";

const validCredential = JSON.stringify([
  {
    id: "protocol-workload",
    secret: "test-only-not-a-secret-".padEnd(48, "x"),
    operations: ["subject.get"],
  },
]);

const validJwks = JSON.stringify({ keys: [{ kty: "RSA", kid: "k1" }] });
const validCookieKeys = JSON.stringify([
  "test-cookie-key-1-".padEnd(48, "x"),
  "test-cookie-key-2-".padEnd(48, "y"),
]);

const productionEnv = {
  NODE_ENV: "production",
  PROTOCOL_ISSUER: "https://id.lab.pics",
  PROTOCOL_ADAPTER: "external",
  PROTOCOL_JWKS: validJwks,
  PROTOCOL_DEV_INTERACTIONS: "false",
  PROTOCOL_BOUNDARY_CREDENTIALS: validCredential,
  PROTOCOL_COOKIE_KEYS: validCookieKeys,
} as const;

describe("Protocol production configuration gates", () => {
  it("accepts a complete production configuration", () => {
    const config = loadConfig({ ...productionEnv });
    assert.equal(config.issuer, "https://id.lab.pics");
    assert.equal(config.adapter, "external");
    assert.notEqual(config.jwks, "generated");
    assert.equal(config.devInteractions, false);
    assert.equal(config.dynamicRegistration, false);
    assert.ok(config.boundaryCredentials);
  });

  it("rejects the memory adapter in production", () => {
    assert.throws(
      () => loadConfig({ ...productionEnv, PROTOCOL_ADAPTER: "memory" }),
      /external durable adapter/,
    );
  });

  it("rejects generated signing keys in production", () => {
    assert.throws(
      () => loadConfig({ ...productionEnv, PROTOCOL_JWKS: "generated" }),
      /supplied JWKS/,
    );
  });

  it("rejects devInteractions in production", () => {
    assert.throws(
      () => loadConfig({ ...productionEnv, PROTOCOL_DEV_INTERACTIONS: "true" }),
      /devInteractions/,
    );
  });

  it("rejects missing boundary credentials in production", () => {
    const env: Record<string, string> = { ...productionEnv };
    delete env.PROTOCOL_BOUNDARY_CREDENTIALS;
    assert.throws(() => loadConfig(env), /Boundary credentials/);
  });

  it("rejects empty boundary credentials array", () => {
    assert.throws(
      () => loadConfig({ ...productionEnv, PROTOCOL_BOUNDARY_CREDENTIALS: "[]" }),
      /non-empty array/,
    );
  });

  it("rejects missing or weak cookie keys in production", () => {
    const missing: Record<string, string> = { ...productionEnv };
    delete missing.PROTOCOL_COOKIE_KEYS;
    assert.throws(() => loadConfig(missing), /PROTOCOL_COOKIE_KEYS/);
    assert.throws(
      () => loadConfig({ ...productionEnv, PROTOCOL_COOKIE_KEYS: JSON.stringify(["too-short"]) }),
      /at least 32 characters/,
    );
  });

  it("rejects a non-canonical production issuer", () => {
    for (const issuer of [
      "https://evil.example",
      "https://id.lab.pics/path",
      "http://id.lab.pics",
    ]) {
      assert.throws(
        () => loadConfig({ ...productionEnv, PROTOCOL_ISSUER: issuer }),
        ProtocolConfigError,
        issuer,
      );
    }
  });

  it("rejects an issuer that is not a canonical HTTPS origin in any environment", () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_ISSUER: "http://localhost:3002" }),
      /canonical HTTPS origin/,
    );
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_ISSUER: "https://id.lab.pics/tenant" }),
      /canonical HTTPS origin/,
    );
  });

  it("rejects malformed boundary credential JSON", () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_BOUNDARY_CREDENTIALS: "{not json" }),
      /Invalid PROTOCOL_BOUNDARY_CREDENTIALS/,
    );
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_BOUNDARY_CREDENTIALS: '{"id":"x"}' }),
      /Invalid PROTOCOL_BOUNDARY_CREDENTIALS/,
    );
  });

  it("rejects malformed JWKS JSON", () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_JWKS: "{not json" }),
      /Invalid PROTOCOL_JWKS/,
    );
    assert.throws(
      () => loadConfig({ NODE_ENV: "test", PROTOCOL_JWKS: '{"keys":"nope"}' }),
      /Invalid PROTOCOL_JWKS/,
    );
  });

  it("pins protocol hardening flags regardless of environment", () => {
    const config = loadConfig({ NODE_ENV: "development" });
    assert.equal(config.devInteractions, false);
    assert.equal(config.dynamicRegistration, false);
    assert.equal(config.implicit, false);
    assert.equal(config.resourceOwnerPassword, false);
  });
});
