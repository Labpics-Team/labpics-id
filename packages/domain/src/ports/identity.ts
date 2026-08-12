import type {
  DeactivateSubjectCommand,
  ReauthenticationResult,
  RegisterSubjectCommand,
  SessionResolution,
  SessionView,
  SubjectView,
} from "../identity/contract";
import type { Email } from "../value-objects/email";
import type { UserId } from "../value-objects/ids";
import type { TokenPurpose } from "./token";
import type { TransactionContext } from "./unit-of-work";

export interface IdentityAuthPort {
  resolveSession(input: { readonly credential: string }): Promise<SessionResolution>;
  reauthenticate(input: { readonly credential: string }): Promise<ReauthenticationResult>;
  revokeSubjectSessions(context: TransactionContext, subjectId: UserId): Promise<void>;
}

export interface IdentityRepository {
  findSubjectById(context: TransactionContext, subjectId: UserId): Promise<SubjectView | null>;
  findSubjectByEmail(context: TransactionContext, email: Email): Promise<SubjectView | null>;
  createSubject(context: TransactionContext, command: RegisterSubjectCommand): Promise<SubjectView>;
  setEmailVerified(context: TransactionContext, subjectId: UserId): Promise<void>;
  storeToken(
    context: TransactionContext,
    input: {
      readonly subjectId: UserId;
      readonly purpose: TokenPurpose;
      readonly digest: string;
      readonly expiresAt: Date;
    },
  ): Promise<void>;
  consumeToken(
    context: TransactionContext,
    input: { readonly purpose: TokenPurpose; readonly digest: string; readonly now: Date },
  ): Promise<UserId | null>;
  createSession(
    context: TransactionContext,
    subjectId: UserId,
    authenticatedAt: Date,
  ): Promise<SessionView>;
  deactivateSubject(context: TransactionContext, subjectId: UserId): Promise<void>;
  listSessions(context: TransactionContext, subjectId: UserId): Promise<readonly SessionView[]>;
  revokeSession(context: TransactionContext, sessionId: string): Promise<void>;
  revokeSubjectSessions(context: TransactionContext, subjectId: UserId): Promise<void>;
}

export interface CredentialPort {
  storePassword(context: TransactionContext, subjectId: UserId, password: string): Promise<void>;
  verifyPassword(
    context: TransactionContext,
    subjectId: UserId,
    password: string,
  ): Promise<boolean>;
}

export interface ProtocolRevocationPort {
  subjectDeactivated(context: TransactionContext, command: DeactivateSubjectCommand): Promise<void>;
}
