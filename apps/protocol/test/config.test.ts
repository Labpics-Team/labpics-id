import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, ProtocolConfigError } from "../src/config.ts";

const VALID_SECRET_32 = "a".repeat(32);
const VALID_JWKS = JSON.stringify({ keys: [{ kty: "RSA", kid: "test", n: "x", e: "AQAB" }] });
const VALID_CREDENTIALS = JSON.stringify([
  { id: "cred-1", secret: VALID_SECRET_32, operations: ["subject.get"] },
]);

function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "production",
    PROTOCOL_ISSUER: "https://id.lab.pics",
    PROTOCOL_ADAPTER: "external",
    PROTOCOL_JWKS: VALID_JWKS,
    PROTOCOL_DEV_INTERACTIONS: "false",
    PROTOCOL_BOUNDARY_CREDENTIALS: VALID_CREDENTIALS,
    ...overrides,
  };
}

describe("Protocol configuration", () => {
  it("loads valid development configuration with defaults", () => {
    const config = loadConfig({});
    assert.equal(config.nodeEnv, "development");
    assert.equal(config.issuer, "https://id.lab.pics");
    assert.equal(config.adapter, "memory");
    assert.equal(config.devInteractions, false);
    assert.equal(config.dynamicRegistration, false);
    assert.equal(config.implicit, false);
    assert.equal(config.resourceOwnerPassword, false);
    assert.equal(config.jwks, "generated");
    assert.equal(config.boundaryTimeoutMs, 3000);
    assert.equal(config.boundaryMaxRetries, 2);
    assert.equal(config.responseLimitBytes, 1_048_576);
  });

  it("rejects non-HTTPS issuer", () => {
    assert.throws(
      () => loadConfig({ PROTOCOL_ISSUER: "http://id.lab.pics" }),
      /canonical HTTPS origin/i,
    );
  });

  it("rejects issuer with path, query, or fragment", () => {
    for (const bad of [
      "https://id.lab.pics/path",
      "https://id.lab.pics?query=1",
      "https://id.lab.pics#fragment",
    ]) {
      assert.throws(() => loadConfig({ PROTOCOL_ISSUER: bad }), /canonical HTTPS origin/i, bad);
    }
  });

  it("accepts valid production configuration", () => {
    const config = loadConfig(productionEnv());
    assert.equal(config.nodeEnv, "production");
    assert.equal(config.adapter, "external");
    assert.equal(typeof config.jwks, "object");
    assert.equal(config.devInteractions, false);
  });

  it("rejects memory adapter in production", () => {
    assert.throws(
      () => loadConfig(productionEnv({ PROTOCOL_ADAPTER: "memory" })),
      /external durable adapter/i,
    );
  });

  it("rejects generated JWKS in production", () => {
    assert.throws(
      () => loadConfig(productionEnv({ PROTOCOL_JWKS: "generated" })),
      /supplied JWKS/i,
    );
  });

  it("rejects devInteractions in production", () => {
    assert.throws(
      () => loadConfig(productionEnv({ PROTOCOL_DEV_INTERACTIONS: "true" })),
      /devInteractions/i,
    );
  });

  it("rejects missing boundary credentials in production", () => {
    const env = productionEnv();
    delete env.PROTOCOL_BOUNDARY_CREDENTIALS;
    assert.throws(() => loadConfig(env), /boundary credentials/i);
  });

  it("rejects wrong issuer in production", () => {
    assert.throws(
      () => loadConfig(productionEnv({ PROTOCOL_ISSUER: "https://other.lab.pics" })),
      /production issuer/i,
    );
  });

  it("rejects invalid JWKS JSON", () => {
    assert.throws(() => loadConfig({ PROTOCOL_JWKS: "not-json" }), /PROTOCOL_JWKS/i);
  });

  it("rejects JWKS without keys array", () => {
    assert.throws(
      () => loadConfig({ PROTOCOL_JWKS: JSON.stringify({ keys: "not-array" }) }),
      /PROTOCOL_JWKS/i,
    );
  });

  it("rejects invalid boundary credentials JSON", () => {
    assert.throws(
      () => loadConfig({ PROTOCOL_BOUNDARY_CREDENTIALS: "not-json" }),
      /PROTOCOL_BOUNDARY_CREDENTIALS/i,
    );
  });

  it("rejects non-array boundary credentials", () => {
    assert.throws(
      () => loadConfig({ PROTOCOL_BOUNDARY_CREDENTIALS: JSON.stringify({ id: "x" }) }),
      /PROTOCOL_BOUNDARY_CREDENTIALS/i,
    );
  });

  it("rejects boundary timeout above 30 seconds", () => {
    assert.throws(() => loadConfig({ PROTOCOL_BOUNDARY_TIMEOUT_MS: "60000" }), ProtocolConfigError);
  });

  it("rejects negative max retries", () => {
    assert.throws(() => loadConfig({ PROTOCOL_BOUNDARY_MAX_RETRIES: "-1" }), ProtocolConfigError);
  });

  it("rejects max retries above 3", () => {
    assert.throws(() => loadConfig({ PROTOCOL_BOUNDARY_MAX_RETRIES: "10" }), ProtocolConfigError);
  });
});
