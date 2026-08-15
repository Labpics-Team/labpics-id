import { z } from "zod";

export class ProtocolConfigError extends Error {
  override readonly name = "ProtocolConfigError";
}

// z.object (not strict): process.env carries unrelated keys (PATH, HOME, ...).
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PROTOCOL_HOST: z.string().min(1).default("127.0.0.1"),
  PROTOCOL_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  PROTOCOL_ISSUER: z.url().default("https://id.lab.pics"),
  PROTOCOL_API_BASE_URL: z.url().default("http://127.0.0.1:3000"),
  PROTOCOL_ADAPTER: z.enum(["memory", "external"]).default("memory"),
  PROTOCOL_JWKS: z.string().default("generated"),
  PROTOCOL_DEV_INTERACTIONS: z.enum(["true", "false"]).default("false"),
  PROTOCOL_BOUNDARY_CREDENTIALS: z.string().optional(),
  PROTOCOL_BOUNDARY_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(3000),
  PROTOCOL_BOUNDARY_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  PROTOCOL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(10_000),
  PROTOCOL_RESPONSE_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .default(1_048_576),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type ProtocolConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new ProtocolConfigError(z.prettifyError(parsed.error));
  const value = parsed.data;

  const issuerUrl = new URL(value.PROTOCOL_ISSUER);
  if (issuerUrl.origin !== value.PROTOCOL_ISSUER || issuerUrl.protocol !== "https:") {
    throw new ProtocolConfigError("PROTOCOL_ISSUER must be a canonical HTTPS origin");
  }

  let boundaryCredentials: readonly unknown[] | undefined;
  if (value.PROTOCOL_BOUNDARY_CREDENTIALS !== undefined) {
    try {
      const raw: unknown = JSON.parse(value.PROTOCOL_BOUNDARY_CREDENTIALS);
      if (!Array.isArray(raw) || raw.length === 0) throw new Error("must be a non-empty array");
      boundaryCredentials = raw;
    } catch (error) {
      throw new ProtocolConfigError(
        `Invalid PROTOCOL_BOUNDARY_CREDENTIALS: ${error instanceof Error ? error.message : "invalid JSON"}`,
      );
    }
  }

  let jwks: "generated" | { keys: Record<string, unknown>[] } = "generated";
  if (value.PROTOCOL_JWKS !== "generated") {
    try {
      const parsedJwks: unknown = JSON.parse(value.PROTOCOL_JWKS);
      if (
        typeof parsedJwks !== "object" ||
        parsedJwks === null ||
        !Array.isArray((parsedJwks as { keys?: unknown }).keys)
      ) {
        throw new Error("must be a JWKS object with keys array");
      }
      jwks = parsedJwks as { keys: Record<string, unknown>[] };
    } catch (error) {
      throw new ProtocolConfigError(
        `Invalid PROTOCOL_JWKS: ${error instanceof Error ? error.message : "invalid JSON"}`,
      );
    }
  }

  // Production fail-closed gates (ch03 invariant 4): the process must refuse
  // to start on quick-start defaults rather than degrade silently.
  const production = value.NODE_ENV === "production";
  if (production && value.PROTOCOL_ISSUER !== "https://id.lab.pics")
    throw new ProtocolConfigError("Production issuer must be https://id.lab.pics");
  if (production && value.PROTOCOL_ADAPTER !== "external")
    throw new ProtocolConfigError("Production requires an external durable adapter");
  if (production && jwks === "generated")
    throw new ProtocolConfigError("Production requires supplied JWKS");
  if (production && value.PROTOCOL_DEV_INTERACTIONS !== "false")
    throw new ProtocolConfigError("devInteractions must be disabled in production");
  if (production && boundaryCredentials === undefined)
    throw new ProtocolConfigError("Boundary credentials are required in production");

  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    host: value.PROTOCOL_HOST,
    port: value.PROTOCOL_PORT,
    issuer: value.PROTOCOL_ISSUER,
    apiBaseUrl: value.PROTOCOL_API_BASE_URL,
    adapter: value.PROTOCOL_ADAPTER,
    jwks,
    devInteractions: false as const,
    dynamicRegistration: false as const,
    implicit: false as const,
    resourceOwnerPassword: false as const,
    boundaryCredentials,
    boundaryTimeoutMs: value.PROTOCOL_BOUNDARY_TIMEOUT_MS,
    boundaryMaxRetries: value.PROTOCOL_BOUNDARY_MAX_RETRIES,
    requestTimeoutMs: value.PROTOCOL_REQUEST_TIMEOUT_MS,
    responseLimitBytes: value.PROTOCOL_RESPONSE_LIMIT_BYTES,
    logLevel: value.LOG_LEVEL,
  });
}
