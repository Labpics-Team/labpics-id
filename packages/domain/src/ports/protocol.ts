import type { TransactionContext } from "./unit-of-work";

export type ProtocolSubjectType = "public" | "pairwise";

export type ProtocolTokenEndpointAuthMethod =
  | "none"
  | "client_secret_basic"
  | "client_secret_post"
  | "client_secret_jwt"
  | "private_key_jwt";

export type ProtocolGrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials"
  | "device_code"
  | "urn:ietf:params:oauth:grant-type:ciba"
  | "urn:ietf:params:oauth:grant-type:pre-authorized_code";

export interface ProtocolClientRecord {
  readonly clientId: string;
  readonly clientName: string | null;
  readonly subjectType: ProtocolSubjectType;
  readonly sectorIdentifier: string | null;
  readonly tokenEndpointAuthMethod: ProtocolTokenEndpointAuthMethod;
  readonly isActive: boolean;
  readonly redirectUris: readonly string[];
  readonly postLogoutRedirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly allowedAudiences: readonly string[];
  readonly allowedGrants: readonly ProtocolGrantType[];
}

export interface ClientRegistryPort {
  getClient(clientId: string, ctx?: TransactionContext): Promise<ProtocolClientRecord | null>;
}

export interface ProtocolConsentRecord {
  readonly subjectId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
}

export interface ConsentPort {
  getConsent(
    subjectId: string,
    clientId: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolConsentRecord | null>;
  upsertConsent(
    subjectId: string,
    clientId: string,
    scopes: readonly string[],
    now: Date,
    ctx?: TransactionContext,
  ): Promise<ProtocolConsentRecord>;
  revokeConsent(
    subjectId: string,
    clientId: string,
    now: Date,
    ctx?: TransactionContext,
  ): Promise<void>;
}

export type ProtocolSigningKeyStatus = "active" | "next" | "retiring" | "retired";

export interface ProtocolSigningKeyRecord {
  readonly kid: string;
  readonly status: ProtocolSigningKeyStatus;
  readonly algorithm: string;
  readonly publicKeyJwk: Record<string, unknown>;
  readonly createdAt: Date;
  readonly retiredAt: Date | null;
}

export interface SigningKeyPort {
  listSigningKeys(ctx?: TransactionContext): Promise<readonly ProtocolSigningKeyRecord[]>;
}

export type ProtocolArtifactModel =
  | "Grant"
  | "Session"
  | "AccessToken"
  | "AuthorizationCode"
  | "RefreshToken"
  | "ClientCredentials"
  | "Client"
  | "InitialAccessToken"
  | "RegistrationAccessToken"
  | "DeviceCode"
  | "Interaction"
  | "ReplayDetection"
  | "BackchannelAuthenticationRequest"
  | "PreAuthorizedCode"
  | "PushedAuthorizationRequest";

export interface ProtocolArtifactRecord {
  readonly model: ProtocolArtifactModel;
  readonly id: string;
  readonly grantId: string | null;
  readonly payload: Record<string, unknown>;
  readonly expiresAt: Date | null;
  readonly consumedAt: Date | null;
  readonly uid: string | null;
  readonly userCode: string | null;
}

export interface ProtocolArtifactPutOptions {
  readonly grantId?: string;
  readonly expiresAt?: Date;
  readonly uid?: string;
  readonly userCode?: string;
}

export interface ProtocolArtifactPort {
  getArtifact(
    model: ProtocolArtifactModel,
    id: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null>;
  putArtifact(
    model: ProtocolArtifactModel,
    id: string,
    payload: Record<string, unknown>,
    options: ProtocolArtifactPutOptions,
    ctx?: TransactionContext,
  ): Promise<void>;
  findArtifactByUid(
    model: ProtocolArtifactModel,
    uid: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null>;
  findArtifactByUserCode(
    model: ProtocolArtifactModel,
    userCode: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null>;
  consumeArtifact(
    model: ProtocolArtifactModel,
    id: string,
    now: Date,
    ctx?: TransactionContext,
  ): Promise<ProtocolArtifactRecord | null>;
  destroyArtifact(
    model: ProtocolArtifactModel,
    id: string,
    ctx?: TransactionContext,
  ): Promise<void>;
  revokeArtifactsByGrantId(grantId: string, now: Date, ctx?: TransactionContext): Promise<number>;
  cleanupExpiredArtifacts(now: Date, ctx?: TransactionContext): Promise<number>;
}
