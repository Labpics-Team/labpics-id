import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Product access grants (subject → resource/scope).
 *
 * Schema-only placeholder mirroring the domain ProductAccess aggregate
 * (packages/domain). `granted`, `expires_at` and `revoked_at` model the
 * lifecycle; the aggregate enforces the invariants.
 */
export const productAccess = pgTable(
  "product_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectId: text("subject_id").notNull(),
    subjectType: text("subject_type").notNull(),
    resource: text("resource").notNull(),
    scope: text("scope").notNull(),
    granted: boolean("granted").notNull().default(true),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    grantedBy: text("granted_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("product_access_subject_idx").on(table.subjectId, table.subjectType)],
);
