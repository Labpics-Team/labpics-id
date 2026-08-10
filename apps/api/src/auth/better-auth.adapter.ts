import type { AuthPort } from "./port";

export interface BetterAuthAdapterConfig {
  readonly secret: string | undefined;
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
  let authHandler: ((request: Request) => Promise<Response>) | null = null;
  return {
    async fetch(request: Request): Promise<Response> {
      if (authHandler === null) {
        const [{ betterAuth }, { memoryAdapter }] = await Promise.all([
          import("better-auth"),
          import("better-auth/adapters/memory"),
        ]);
        const secret = config.secret ?? "dev-only-insecure-secret-change-me";
        const options: Parameters<typeof betterAuth>[0] = {
          secret,
          // Better Auth's default basePath is "/api/auth"; the scaffold mounts
          // at "/auth", so the basePath is aligned explicitly.
          basePath: "/auth",
          trustedOrigins: [...config.trustedOrigins],
          database: memoryAdapter({}),
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
