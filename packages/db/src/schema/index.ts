import type { productAccess as productAccessTable } from "./access";
import type { auditEvents as auditEventsTable } from "./audit";
import type { sessions, users } from "./auth";

export * from "./abuse";
export * from "./access";
export * from "./audit";
export * from "./auth";
export * from "./organization";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type NewAuditEvent = typeof auditEventsTable.$inferInsert;
export type ProductAccessRow = typeof productAccessTable.$inferSelect;
export type NewProductAccess = typeof productAccessTable.$inferInsert;
