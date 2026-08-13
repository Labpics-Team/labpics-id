import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    keyDigest: text("key_digest").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_rate_limits_action_key_unique").on(table.action, table.keyDigest),
    index("auth_rate_limits_locked_until_idx").on(table.lockedUntil),
  ],
);
