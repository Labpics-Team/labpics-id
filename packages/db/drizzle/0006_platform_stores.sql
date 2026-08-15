CREATE TYPE "public"."protocol_artifact_model" AS ENUM('Grant', 'Session', 'AccessToken', 'AuthorizationCode', 'RefreshToken', 'ClientCredentials', 'Client', 'InitialAccessToken', 'RegistrationAccessToken', 'DeviceCode', 'Interaction', 'ReplayDetection', 'BackchannelAuthenticationRequest', 'PreAuthorizedCode', 'PushedAuthorizationRequest');--> statement-breakpoint
CREATE TYPE "public"."protocol_grant_type" AS ENUM('authorization_code', 'refresh_token', 'client_credentials', 'device_code', 'urn:ietf:params:oauth:grant-type:ciba', 'urn:ietf:params:oauth:grant-type:pre-authorized_code');--> statement-breakpoint
CREATE TYPE "public"."protocol_signing_key_status" AS ENUM('active', 'next', 'retiring', 'retired');--> statement-breakpoint
CREATE TYPE "public"."protocol_subject_type" AS ENUM('public', 'pairwise');--> statement-breakpoint
CREATE TYPE "public"."protocol_token_endpoint_auth_method" AS ENUM('none', 'client_secret_basic', 'client_secret_post', 'client_secret_jwt', 'private_key_jwt');--> statement-breakpoint
CREATE TABLE "bootstrap_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_digest" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_tokens_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
CREATE TABLE "platform_administrators" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_administrators_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_allowed_audiences" (
	"client_id" text NOT NULL,
	"audience" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_allowed_grants" (
	"client_id" text NOT NULL,
	"grant_type" "protocol_grant_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_allowed_scopes" (
	"client_id" text NOT NULL,
	"scope" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_credentials" (
	"client_id" text NOT NULL,
	"credential_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_post_logout_redirect_uris" (
	"client_id" text NOT NULL,
	"uri" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_redirect_uris" (
	"client_id" text NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "oauth_client_redirect_uris_no_fragment" CHECK (position('#' in uri) = 0)
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text,
	"subject_type" "protocol_subject_type" DEFAULT 'public' NOT NULL,
	"sector_identifier" text,
	"token_endpoint_auth_method" "protocol_token_endpoint_auth_method" DEFAULT 'client_secret_basic' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"client_id" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "protocol_artifacts" (
	"model" "protocol_artifact_model" NOT NULL,
	"id" text NOT NULL,
	"grant_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"uid" text,
	"user_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_signing_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"status" "protocol_signing_key_status" NOT NULL,
	"algorithm" text NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_client_allowed_audiences" ADD CONSTRAINT "oauth_client_allowed_audiences_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_allowed_grants" ADD CONSTRAINT "oauth_client_allowed_grants_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_allowed_scopes" ADD CONSTRAINT "oauth_client_allowed_scopes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_credentials" ADD CONSTRAINT "oauth_client_credentials_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_post_logout_redirect_uris" ADD CONSTRAINT "oauth_client_post_logout_redirect_uris_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_artifacts" ADD CONSTRAINT "protocol_artifacts_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_allowed_audiences_client_audience_unique" ON "oauth_client_allowed_audiences" USING btree ("client_id","audience");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_allowed_grants_client_grant_unique" ON "oauth_client_allowed_grants" USING btree ("client_id","grant_type");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_allowed_scopes_client_scope_unique" ON "oauth_client_allowed_scopes" USING btree ("client_id","scope");--> statement-breakpoint
CREATE INDEX "oauth_client_credentials_client_idx" ON "oauth_client_credentials" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_post_logout_redirect_uris_client_uri_unique" ON "oauth_client_post_logout_redirect_uris" USING btree ("client_id","uri");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_redirect_uris_client_uri_unique" ON "oauth_client_redirect_uris" USING btree ("client_id","uri");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_sector_identifier_active_unique" ON "oauth_clients" USING btree ("sector_identifier") WHERE is_active = true AND sector_identifier IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consents_subject_client_active_unique" ON "oauth_consents" USING btree ("subject_id","client_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "oauth_consents_client_idx" ON "oauth_consents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_grants_client_subject_idx" ON "oauth_grants" USING btree ("client_id","subject_id");--> statement-breakpoint
CREATE INDEX "oauth_grants_expires_idx" ON "oauth_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_artifacts_pk" ON "protocol_artifacts" USING btree ("model","id");--> statement-breakpoint
CREATE INDEX "protocol_artifacts_grant_idx" ON "protocol_artifacts" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "protocol_artifacts_expires_idx" ON "protocol_artifacts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_artifacts_uid_unique" ON "protocol_artifacts" USING btree ("model","uid") WHERE uid IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_artifacts_user_code_unique" ON "protocol_artifacts" USING btree ("model","user_code") WHERE user_code IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_signing_keys_active_unique" ON "protocol_signing_keys" USING btree ("status") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "protocol_signing_keys_status_idx" ON "protocol_signing_keys" USING btree ("status");