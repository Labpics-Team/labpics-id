CREATE TABLE "session_refresh_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"family_id" text NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_refresh_credentials_digest_unique" UNIQUE("digest")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
UPDATE "sessions" SET "last_active_at" = "updated_at";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "sessions" SET "absolute_expires_at" = "expires_at";--> statement-breakpoint
ALTER TABLE "session_refresh_credentials" ADD CONSTRAINT "session_refresh_credentials_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_refresh_credentials_session_idx" ON "session_refresh_credentials" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_refresh_credentials_family_idx" ON "session_refresh_credentials" USING btree ("family_id");
