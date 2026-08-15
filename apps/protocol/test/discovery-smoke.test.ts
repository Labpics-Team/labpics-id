import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createBoundaryClient } from "../src/boundary.ts";
import { loadConfig } from "../src/config.ts";
import { createLogger } from "../src/lib/logger.ts";
import { createProtocolApp } from "../src/protocol-app.ts";

/**
 * Runtime smoke: the real oidc-provider app under the pinned Node runtime.
 * Proves discovery serves the configured issuer and that caller-supplied
 * forwarding/identity headers cannot change issuer, subject or redirect
 * construction (ch03 verification bullets 1 and 3).
 *
 * Node-only by design: the production entrypoint guard forbids Bun entirely
 * (proved by runtime-guard.test.ts), so under Bun this suite is skipped
 * rather than simulated.
 */
const underBun = "Bun" in globalThis;

const config = loadConfig({ NODE_ENV: "test" });
const logger = createLogger("silent");

let server: Server;
let baseUrl: string;

before(async () => {
  if (underBun) return;
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  assert.ok(
    major > 22 || (major === 22 && minor >= 11),
    `Node >=22.11 required, found ${process.versions.node}`,
  );

  const boundaryClient = createBoundaryClient({
    credentials: config.boundaryCredentials,
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.boundaryTimeoutMs,
    maxRetries: config.boundaryMaxRetries,
    logger,
  });
  const app = createProtocolApp({ config, boundaryClient, logger });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server?.close();
});

// Bun's node:test shim ignores the options-object skip form, so choose the
// suite function explicitly.
const suite = underBun ? describe.skip : describe;

suite("Discovery smoke under pinned runtime", () => {
  it("serves discovery with the configured issuer, not the Host header", async () => {
    // fetch (undici) silently drops a caller-set Host header, which would make
    // this assertion vacuous. Deliver a genuinely spoofed Host via raw
    // http.request with setHost:false: sabotage-verified — without the
    // canonical href pin in protocol-app.ts, token_endpoint becomes
    // http://attacker.example/token and this test goes red.
    const { port } = server.address() as AddressInfo;
    const raw = await new Promise<string>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: "/.well-known/openid-configuration",
          method: "GET",
          setHost: false,
          headers: { host: "attacker.example" },
        },
        (res) => {
          assert.equal(res.statusCode, 200);
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString("utf8");
          });
          res.on("end", () => resolve(data));
        },
      );
      req.on("error", reject);
      req.end();
    });
    const body = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(body.issuer, "https://id.lab.pics");
    for (const endpoint of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
      "end_session_endpoint",
    ]) {
      const value = body[endpoint];
      assert.equal(typeof value, "string", endpoint);
      assert.ok(
        (value as string).startsWith("https://id.lab.pics/"),
        `${endpoint} must be issuer-derived, got ${String(value)}`,
      );
    }
    assert.ok(!raw.includes("attacker.example"), "spoofed Host must not leak into any URL");
  });

  it("keeps hardened defaults: no dynamic registration, code-only, S256 PKCE", async () => {
    const response = await fetch(`${baseUrl}/.well-known/openid-configuration`);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.registration_endpoint, undefined, "dynamic registration must be disabled");
    assert.deepEqual(body.response_types_supported, ["code"]);
    assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
    const grants = body.grant_types_supported as string[];
    assert.ok(!grants.includes("implicit"), "implicit must be disabled");
    assert.ok(!grants.includes("password"), "ROPC must be disabled");
  });

  it("rejects requests carrying forwarding headers", async () => {
    for (const header of [
      ["x-forwarded-for", "10.0.0.1"],
      ["x-forwarded-host", "attacker.example"],
      ["x-forwarded-proto", "https"],
      ["forwarded", "for=10.0.0.1;host=attacker.example"],
      ["x-real-ip", "10.0.0.1"],
    ] as const) {
      const response = await fetch(`${baseUrl}/.well-known/openid-configuration`, {
        headers: { [header[0]]: header[1] },
      });
      assert.equal(response.status, 400, header[0]);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "untrusted_header");
    }
  });

  it("rejects requests carrying caller-supplied identity headers", async () => {
    for (const header of ["x-labpics-subject", "x-labpics-session", "x-labpics-workload"]) {
      const response = await fetch(`${baseUrl}/.well-known/openid-configuration`, {
        headers: { [header]: "admin" },
      });
      assert.equal(response.status, 400, header);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, "untrusted_header");
    }
  });

  it("does not redirect to an unregistered redirect_uri on authorization requests", async () => {
    const params = new URLSearchParams({
      client_id: "ghost-client",
      response_type: "code",
      redirect_uri: "https://attacker.example/cb",
      scope: "openid",
      state: "s",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
    });
    const response = await fetch(`${baseUrl}/auth?${params.toString()}`, { redirect: "manual" });
    // Unknown client fails closed at the provider; must not redirect to the attacker URI.
    assert.ok(response.status >= 400, `expected error status, got ${response.status}`);
    assert.equal(response.headers.get("location"), null);
  });

  it("sets no-store cache policy on protocol responses", async () => {
    const response = await fetch(`${baseUrl}/.well-known/openid-configuration`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
