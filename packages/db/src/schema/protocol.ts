import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const protocolSubjectTypeEnum = pgEnum("protocol_subject_type", ["public", "pairwise"]);

export const protocolTokenEndpointAuthMethodEnum = pgEnum("protocol_token_endpoint_auth_method", [
  "none",
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
]);

export const protocolGrantTypeEnum = pgEnum("protocol_grant_type", [
  "authorization_code",
  "refresh_token",
  "client_credentials",
  "device_code",
  "urn:ietf:params:oauth:grant-type:ciba",
  "urn:ietf:params:oauth:grant-type:pre-authorized_code",
]);

export const protocolSigningKeyStatusEnum = pgEnum("protocol_signing_key_status", [
  "active",
  "next",
  "retiring",
  "retired",
]);

export const protocolArtifactModelEnum = pgEnum("protocol_artifact_model", [
  "Grant",
  "Session",
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "ClientCredentials",
  "Client",
  "InitialAccessToken",
  "RegistrationAccessToken",
  "DeviceCode",
  "Interaction",
  "ReplayDetection",
  "BackchannelAuthenticationRequest",
  "PreAuthorizedCode",
  "PushedAuthorizationRequest",
]);

export const oauthClients = pgTable(
  "oauth_clients",
  {
    clientId: text("client_id").primaryKey(),
    clientName: text("client_name"),
    subjectType: protocolSubjectTypeEnum("subject_type").notNull().default("public"),
    sectorIdentifier: text("sector_identifier"),
    tokenEndpointAuthMethod: protocolTokenEndpointAuthMethodEnum("token_endpoint_auth_method")
      .notNull()
      .default("client_secret_basic"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // Non-unique on purpose: OIDC pairwise sector identifiers legitimately
    // group multiple clients under one sector (per-sector `sub` values).
    index("oauth_clients_sector_identifier_idx")
      .on(table.sectorIdentifier)
      .where(sql`is_active = true AND sector_identifier IS NOT NULL`),
  ],
);

export const oauthClientCredentials = pgTable(
  "oauth_client_credentials",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    credentialHash: text("credential_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("oauth_client_credentials_client_idx").on(table.clientId)],
);

export const oauthClientRedirectUris = pgTable(
  "oauth_client_redirect_uris",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    uri: text("uri").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_client_redirect_uris_client_uri_unique").on(table.clientId, table.uri),
    check("oauth_client_redirect_uris_no_fragment", sql`position('#' in uri) = 0`),
  ],
);

export const oauthClientPostLogoutRedirectUris = pgTable(
  "oauth_client_post_logout_redirect_uris",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    uri: text("uri").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_client_post_logout_redirect_uris_client_uri_unique").on(
      table.clientId,
      table.uri,
    ),
  ],
);

export const oauthClientAllowedScopes = pgTable(
  "oauth_client_allowed_scopes",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_client_allowed_scopes_client_scope_unique").on(table.clientId, table.scope),
  ],
);

export const oauthClientAllowedAudiences = pgTable(
  "oauth_client_allowed_audiences",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_client_allowed_audiences_client_audience_unique").on(
      table.clientId,
      table.audience,
    ),
  ],
);

export const oauthClientAllowedGrants = pgTable(
  "oauth_client_allowed_grants",
  {
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    grantType: protocolGrantTypeEnum("grant_type").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_client_allowed_grants_client_grant_unique").on(
      table.clientId,
      table.grantType,
    ),
  ],
);

export const oauthConsents = pgTable(
  "oauth_consents",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    scopes: jsonb("scopes").notNull().$type<string[]>().default([]),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("oauth_consents_subject_client_active_unique")
      .on(table.subjectId, table.clientId)
      .where(sql`revoked_at IS NULL`),
    index("oauth_consents_client_idx").on(table.clientId),
  ],
);

export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    subjectId: text("subject_id").notNull(),
    scopes: jsonb("scopes").notNull().$type<string[]>().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("oauth_grants_client_subject_idx").on(table.clientId, table.subjectId),
    index("oauth_grants_expires_idx").on(table.expiresAt),
  ],
);

export const protocolArtifacts = pgTable(
  "protocol_artifacts",
  {
    model: protocolArtifactModelEnum("model").notNull(),
    id: text("id").notNull(),
    // Opaque oidc-provider correlation key, intentionally NOT an FK to
    // oauth_grants: the authoritative Grant record lives in this same table
    // (model = 'Grant'), and no platform code writes oauth_grants yet — an FK
    // would reject every grant-linked token insert at runtime.
    grantId: text("grant_id"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    uid: text("uid"),
    userCode: text("user_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // Real composite PK (not a unique index): gives the table a REPLICA
    // IDENTITY for logical replication and makes the row identity explicit.
    primaryKey({ name: "protocol_artifacts_pk", columns: [table.model, table.id] }),
    index("protocol_artifacts_grant_idx").on(table.grantId),
    index("protocol_artifacts_expires_idx").on(table.expiresAt),
    uniqueIndex("protocol_artifacts_uid_unique")
      .on(table.model, table.uid)
      .where(sql`uid IS NOT NULL`),
    uniqueIndex("protocol_artifacts_user_code_unique")
      .on(table.model, table.userCode)
      .where(sql`user_code IS NOT NULL`),
  ],
);

export const protocolSigningKeys = pgTable(
  "protocol_signing_keys",
  {
    kid: text("kid").primaryKey(),
    status: protocolSigningKeyStatusEnum("status").notNull(),
    algorithm: text("algorithm").notNull(),
    publicKeyJwk: jsonb("public_key_jwk").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("protocol_signing_keys_active_unique")
      .on(table.status)
      .where(sql`status = 'active'`),
    index("protocol_signing_keys_status_idx").on(table.status),
  ],
);
