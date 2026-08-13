import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bootstrapTokens = pgTable("bootstrap_tokens", {
  id: text("id").primaryKey(),
  tokenDigest: text("token_digest").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const platformAdministrators = pgTable("platform_administrators", {
  singleton: boolean("singleton").primaryKey().default(true),
  userId: text("user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
