CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id_digest" text NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"account_id" text,
	"code_verifier" text NOT NULL,
	"attempts_remaining" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"source_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "otp_challenges_challenge_id_digest_unique" ON "otp_challenges" USING btree ("challenge_id_digest");--> statement-breakpoint
CREATE INDEX "otp_challenges_open_expires_idx" ON "otp_challenges" USING btree ("expires_at") WHERE "otp_challenges"."consumed_at" is null;