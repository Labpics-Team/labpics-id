export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type NodeEnv = "development" | "test" | "production";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string | undefined;
  readonly authSecret: string | undefined;
  readonly authBaseUrl: string | undefined;
  readonly authPersistence: "memory";
  readonly corsAllowedOrigins: readonly string[];
  readonly requestTimeoutMs: number;
  readonly logLevel: LogLevel;
}

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const LOG_LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
  fallback: T,
): T {
  if (value === undefined || value.trim() === "") return fallback;
  const matched = allowed.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new ConfigError(`Invalid ${name}: "${value}"`);
  }
  return matched;
}

function parsePositiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`Invalid ${name}: "${value}"`);
  }
  return parsed;
}

const FALLBACK_SECRETS = new Set([
  "dev-only-insecure-secret-change-me",
  "replace-me-with-a-32-byte-random-secret",
  "test-only-secret-with-at-least-32-characters",
]);

function parseCorsOrigins(value: string | undefined, nodeEnv: NodeEnv): readonly string[] {
  if (nodeEnv === "production" && (value === undefined || value.trim() === "")) {
    throw new ConfigError("CORS_ALLOWED_ORIGINS is required in production");
  }
  const raw = value === undefined || value.trim() === "" ? "http://localhost:3001" : value;
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw new ConfigError("At least one allowed CORS origin is required");
  }
  const canonical = items.map((item) => {
    if (item === "*") throw new ConfigError("Wildcard CORS origins are forbidden");
    let url: URL;
    try {
      url = new URL(item);
    } catch (error) {
      if (error instanceof TypeError) throw new ConfigError(`Invalid CORS origin: "${item}"`);
      throw error;
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.origin !== item
    ) {
      throw new ConfigError(`Invalid CORS origin: "${item}"`);
    }
    return url.origin;
  });
  if (new Set(canonical).size !== canonical.length) {
    throw new ConfigError("Duplicate CORS origins are forbidden");
  }
  return canonical;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseEnum(env.NODE_ENV, NODE_ENVS, "NODE_ENV", "development");
  const configuredSecret = env.BETTER_AUTH_SECRET?.trim();
  const authSecret = configuredSecret === "" ? undefined : configuredSecret;
  if (nodeEnv === "production" && authSecret === undefined) {
    throw new ConfigError("BETTER_AUTH_SECRET is required in production");
  }
  if (authSecret !== undefined && authSecret.length < 32) {
    throw new ConfigError("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (nodeEnv === "production" && authSecret !== undefined && FALLBACK_SECRETS.has(authSecret)) {
    throw new ConfigError("BETTER_AUTH_SECRET must not use a known fallback value in production");
  }
  return {
    nodeEnv,
    host: env.HOST?.trim() !== "" ? (env.HOST ?? "0.0.0.0") : "0.0.0.0",
    port: parsePositiveInt(env.PORT, "PORT", 3000),
    databaseUrl: env.DATABASE_URL?.trim() === "" ? undefined : env.DATABASE_URL,
    authSecret,
    authBaseUrl: env.BETTER_AUTH_URL?.trim() === "" ? undefined : env.BETTER_AUTH_URL,
    authPersistence: "memory",
    corsAllowedOrigins: parseCorsOrigins(env.CORS_ALLOWED_ORIGINS, nodeEnv),
    requestTimeoutMs: parsePositiveInt(env.REQUEST_TIMEOUT_MS, "REQUEST_TIMEOUT_MS", 10_000),
    logLevel: parseEnum(env.LOG_LEVEL, LOG_LEVELS, "LOG_LEVEL", "info"),
  };
}
