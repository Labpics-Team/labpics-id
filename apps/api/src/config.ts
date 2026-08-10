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
  readonly betterAuthSecret: string | undefined;
  readonly betterAuthUrl: string | undefined;
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

function parseList(value: string | undefined, fallback: readonly string[]): readonly string[] {
  const raw = value === undefined || value.trim() === "" ? fallback.join(",") : value;
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw new ConfigError("At least one allowed CORS origin is required");
  }
  return items;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: parseEnum(env.NODE_ENV, NODE_ENVS, "NODE_ENV", "development"),
    host: env.HOST?.trim() !== "" ? (env.HOST ?? "0.0.0.0") : "0.0.0.0",
    port: parsePositiveInt(env.PORT, "PORT", 3000),
    databaseUrl: env.DATABASE_URL?.trim() === "" ? undefined : env.DATABASE_URL,
    betterAuthSecret: env.BETTER_AUTH_SECRET?.trim() === "" ? undefined : env.BETTER_AUTH_SECRET,
    betterAuthUrl: env.BETTER_AUTH_URL?.trim() === "" ? undefined : env.BETTER_AUTH_URL,
    corsAllowedOrigins: parseList(env.CORS_ALLOWED_ORIGINS, ["http://localhost:3001"]),
    requestTimeoutMs: parsePositiveInt(env.REQUEST_TIMEOUT_MS, "REQUEST_TIMEOUT_MS", 10_000),
    logLevel: parseEnum(env.LOG_LEVEL, LOG_LEVELS, "LOG_LEVEL", "info"),
  };
}
