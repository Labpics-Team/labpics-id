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
import type { TransactionContext } from "./unit-of-work";

export interface IdentityAuthPort {
  resolveSession(input: { readonly credential: string }): Promise<SessionResolution>;
  reauthenticate(input: { readonly credential: string }): Promise<ReauthenticationResult>;
  revokeSubjectSessions(context: TransactionContext, subjectId: UserId): Promise<void>;
}

export interface IdentityRepository {
  findSubjectByEmail(context: TransactionContext, email: Email): Promise<SubjectView | null>;
  createSubject(context: TransactionContext, command: RegisterSubjectCommand): Promise<UserId>;
  setEmailVerified(context: TransactionContext, subjectId: UserId): Promise<void>;
  deactivateSubject(context: TransactionContext, subjectId: UserId): Promise<void>;
  listSessions(context: TransactionContext, subjectId: UserId): Promise<readonly SessionView[]>;
  revokeSession(context: TransactionContext, sessionId: string): Promise<void>;
  revokeSubjectSessions(context: TransactionContext, subjectId: UserId): Promise<void>;
}

export interface ProtocolRevocationPort {
  subjectDeactivated(context: TransactionContext, command: DeactivateSubjectCommand): Promise<void>;
}
