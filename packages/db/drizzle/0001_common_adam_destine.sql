ALTER TABLE "member" DROP CONSTRAINT "member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_role_id_role_id_fk";
--> statement-breakpoint
DROP INDEX "member_organization_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "role_organization_id_unique" ON "role" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_role_fk" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."role"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" USING btree ("organization_id","user_id");
