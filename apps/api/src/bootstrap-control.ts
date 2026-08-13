import { FirstAdminBootstrap } from "@labpics/db";
import type { RateLimitPort } from "@labpics/domain";
import { Email } from "@labpics/domain";
import type { DatabaseConnection } from "./lib/db";

export interface BootstrapControlConfig {
  readonly enabled: boolean;
  readonly verifiedEmail: string | undefined;
}

export function createBootstrapControl(
  config: BootstrapControlConfig,
  database: DatabaseConnection | null,
  rateLimit?: RateLimitPort,
): FirstAdminBootstrap | null {
  if (!config.enabled) return null;
  if (database === null) throw new BootstrapControlError("Bootstrap requires durable database");
  if (config.verifiedEmail === undefined)
    throw new BootstrapControlError("Bootstrap verified email required");
  Email.from(config.verifiedEmail);
  if (rateLimit === undefined) throw new BootstrapControlError("Bootstrap limiter required");
  return new FirstAdminBootstrap(database.db, rateLimit);
}

export class BootstrapControlError extends Error {
  override readonly name = "BootstrapControlError";
}
