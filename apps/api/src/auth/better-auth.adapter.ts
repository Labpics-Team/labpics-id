import { accounts, type Database, sessions, users, verificationTokens } from "@labpics/db";
import { type AuthPersistence, ConfigError, type NodeEnv } from "../config";
import type { AuthPort } from "./port";

export interface BetterAuthAdapterConfig {
  readonly runtime: NodeEnv;
  readonly persistence: AuthPersistence;
  readonly database: Database | undefined;
  readonly secret: string;
  readonly baseUrl: string | undefined;
  readonly trustedOrigins: readonly string[];
}

/**
 * Port wrapper around Better Auth.
 *
 * better-auth is imported ONLY here — and only lazily, via dynamic import — so
 * the rest of the application never depends on it. The scaffold uses the memory
 * adapter so /auth responds without a database; wiring the Drizzle adapter
 * (packages/db schema) is owned by a later chapter.
 */
export function createBetterAuthPort(config: BetterAuthAdapterConfig): AuthPort {
  if (config.runtime === "production" && config.persistence === "memory") {
    throw new ConfigError("The memory authentication adapter is forbidden in production");
  }
  if (config.persistence === "postgres" && config.database === undefined) {
    throw new ConfigError("A database is required for durable authentication persistence");
  }
  const durableDatabase = config.database;
  let authHandler: ((request: Request) => Promise<Response>) | null = null;
  return {
    async fetch(request: Request): Promise<Response> {
      if (authHandler === null) {
        const { betterAuth } = await import("better-auth");
        let database: Parameters<typeof betterAuth>[0]["database"];
        if (config.persistence === "postgres") {
          if (durableDatabase === undefined) {
            throw new ConfigError("A database is required for durable authentication persistence");
          }
          database = (await import("better-auth/adapters/drizzle")).drizzleAdapter(
            durableDatabase,
            {
              provider: "pg",
              schema: {
                user: users,
                session: sessions,
                account: accounts,
                verification: verificationTokens,
              },
            },
          );
        } else {
          database = (await import("better-auth/adapters/memory")).memoryAdapter({
            user: [],
            session: [],
            account: [],
            verification: [],
          });
        }
        const options: Parameters<typeof betterAuth>[0] = {
          secret: config.secret,
          // Better Auth's default basePath is "/api/auth"; the scaffold mounts
          // at "/auth", so the basePath is aligned explicitly.
          basePath: "/auth",
          trustedOrigins: [...config.trustedOrigins],
          database,
          emailAndPassword: { enabled: true },
        };
        if (config.baseUrl !== undefined) {
          options.baseURL = config.baseUrl;
        }
        authHandler = betterAuth(options).handler;
      }
      return authHandler(request);
    },
  };
}
