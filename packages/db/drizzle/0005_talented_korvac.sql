CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"key_digest" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "last_active_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limits_action_key_unique" ON "auth_rate_limits" USING btree ("action","key_digest");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_locked_until_idx" ON "auth_rate_limits" USING btree ("locked_until");