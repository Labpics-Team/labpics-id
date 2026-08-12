import type { Email } from "../value-objects/email";
import type { UserId } from "../value-objects/ids";

export type AuthenticationMethod = "password" | "email_otp" | "magic_link" | "passkey" | "totp";
export type SubjectState = "active" | "deactivated";
export type SessionState = "active" | "revoked" | "expired";

export interface SubjectView {
  readonly id: UserId;
  readonly email: Email;
  readonly emailVerified: boolean;
  readonly state: SubjectState;
}

export interface SessionView {
  readonly id: string;
  readonly subjectId: UserId;
  readonly authenticatedAt: Date;
  readonly expiresAt: Date;
  readonly authenticationMethods: readonly AuthenticationMethod[];
  readonly state: SessionState;
}

export interface RegisterSubjectCommand {
  readonly email: Email;
  readonly name: string;
  readonly password: string;
}

export interface VerifyEmailCommand {
  readonly token: string;
}

export interface SignInCommand {
  readonly email: Email;
  readonly password: string;
}

export interface RequestPasswordResetCommand {
  readonly email: Email;
}

export interface ResetPasswordCommand {
  readonly token: string;
  readonly newPassword: string;
}

export interface DeactivateSubjectCommand {
  readonly subjectId: UserId;
}

export interface RevokeSessionCommand {
  readonly subjectId: UserId;
  readonly sessionId: string;
}

export type IdentityFailure =
  | { readonly kind: "conflict" }
  | { readonly kind: "invalid_credentials" }
  | { readonly kind: "invalid_token" }
  | { readonly kind: "rate_limited"; readonly retryAt: Date }
  | { readonly kind: "subject_deactivated" }
  | { readonly kind: "subject_not_found" }
  | { readonly kind: "unverified_email" };

export type IdentityResult<T> =
  | { readonly kind: "accepted"; readonly value: T }
  | { readonly kind: "rejected"; readonly error: IdentityFailure };

export type SessionResolution =
  | { readonly kind: "anonymous" }
  | {
      readonly kind: "authenticated";
      readonly subject: SubjectView;
      readonly session: SessionView;
    };

export type ReauthenticationResult =
  | { readonly kind: "authenticated"; readonly subject: SubjectView; readonly session: SessionView }
  | { readonly kind: "rejected"; readonly error: IdentityFailure };

export interface SubjectDeactivated {
  readonly subjectId: UserId;
  readonly occurredAt: Date;
}

export interface IdentityUseCases {
  register(command: RegisterSubjectCommand): Promise<IdentityResult<SubjectView>>;
  verifyEmail(command: VerifyEmailCommand): Promise<IdentityResult<SubjectView>>;
  signIn(command: SignInCommand): Promise<IdentityResult<SessionView>>;
  requestPasswordReset(command: RequestPasswordResetCommand): Promise<IdentityResult<void>>;
  resetPassword(command: ResetPasswordCommand): Promise<IdentityResult<void>>;
  deactivate(command: DeactivateSubjectCommand): Promise<IdentityResult<SubjectDeactivated>>;
  listSessions(subjectId: UserId): Promise<IdentityResult<readonly SessionView[]>>;
  revokeSession(command: RevokeSessionCommand): Promise<IdentityResult<void>>;
}
