import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ErrorEnvelope } from "@labpics/contracts";
import { type PostgresTestContainer, startPostgres } from "@labpics/testkit";
import { Hono } from "hono";
import { type AppDeps, createApp } from "./app";
import { type AppConfig, loadConfig } from "./config";
import { createDatabaseConnection } from "./lib/db";
import { createLogger, type Logger } from "./lib/logger";
import { errorEnvelope } from "./middleware/error-envelope";
import { requestId } from "./middleware/request-id";
import type { AppVariables } from "./types";

function testConfig(env: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "fatal",
    CORS_ALLOWED_ORIGINS: "http://localhost:3001",
    REQUEST_TIMEOUT_MS: "5000",
    ...env,
  });
}

function makeDeps(env: Record<string, string | undefined> = {}): AppDeps {
  const config = testConfig(env);
  const logger = createLogger(config.logLevel);
  return { config, logger, database: null };
}

const logger: Logger = createLogger("fatal");

describe("api bootstrap", () => {
  it("GET /health returns 200 with the health contract", async () => {
    const app = createApp(makeDeps());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; time: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("labpics-api");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });

  it("GET /ready returns 503 when no database is configured", async () => {
    const app = createApp(makeDeps());
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; database: string; reason: string };
    expect(body.status).toBe("not_ready");
    expect(body.database).toBe("down");
    expect(body.reason).toBe("database not configured");
  });

  it("GET /api/v1/ping echoes the request id", async () => {
    const app = createApp(makeDeps());
    const res = await app.request("/api/v1/ping", {
      headers: { "x-request-id": "test-request-123" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; requestId: string };
    expect(body.ok).toBe(true);
    expect(body.requestId).toBe("test-request-123");
  });

  it("returns a generic 500 envelope without leaking internals", async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    app.use("*", requestId());
    app.onError(errorEnvelope(logger));
    app.get("/boom", () => {
      throw new Error("database password=supersecret");
    });
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).not.toContain("supersecret");
  });

  it("preserves a valid incoming request-id header", async () => {
    const app = createApp(makeDeps());
    const res = await app.request("/health", { headers: { "x-request-id": "abc-123" } });
    expect(res.headers.get("x-request-id")).toBe("abc-123");
  });

  describe("cors allowlist", () => {
    it("allows an origin in the allowlist", async () => {
      const app = createApp(makeDeps());
      const res = await app.request("/health", { headers: { Origin: "http://localhost:3001" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    });

    it("does not emit CORS headers for a disallowed origin", async () => {
      const app = createApp(makeDeps());
      const res = await app.request("/health", { headers: { Origin: "https://evil.example" } });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("accepts preflight from an allowed origin", async () => {
      const app = createApp(makeDeps());
      const res = await app.request("/api/v1/ping", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3001", "Access-Control-Request-Method": "GET" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    });

    it("rejects preflight from a disallowed origin", async () => {
      const app = createApp(makeDeps());
      const res = await app.request("/api/v1/ping", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("cors_origin_not_allowed");
    });
  });
});

// DB-backed readiness test. Priority: TEST_DATABASE_URL (CI/compose) →
// Testcontainers (local Linux/macOS). On Windows, bun cannot drive dockerode
// over the named pipe, so without TEST_DATABASE_URL the suite is skipped (the
// Windows DB path is covered by `docker compose up -d` + migrate).
const dbTestConnection = process.env.TEST_DATABASE_URL;
const runDbTest = dbTestConnection !== undefined || process.platform !== "win32";

describe.skipIf(!runDbTest)("readiness against a real database", () => {
  let postgres: PostgresTestContainer | null = null;
  let connectionString: string | undefined;

  beforeAll(async () => {
    if (dbTestConnection !== undefined) {
      connectionString = dbTestConnection;
      return;
    }
    postgres = await startPostgres();
    connectionString = postgres.connectionString;
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it("GET /ready returns 200 when the pool can reach Postgres", async () => {
    if (connectionString === undefined) {
      throw new Error("no test database connection available");
    }
    const deps = makeDeps();
    const database = createDatabaseConnection(connectionString, logger);
    const app = createApp({ ...deps, database });
    try {
      const res = await app.request("/ready");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; database: string };
      expect(body.status).toBe("ready");
      expect(body.database).toBe("up");
    } finally {
      await database.close();
    }
  });
});
