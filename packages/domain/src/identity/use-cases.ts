import type { AuditLogPort } from "../ports/audit-log";
import type { ClockPort } from "../ports/clock";
import type { CredentialPort, IdentityRepository, ProtocolRevocationPort } from "../ports/identity";
import type { NotificationPort } from "../ports/notification";
import type { OutboxPort } from "../ports/outbox";
import type { RateLimitPort } from "../ports/rate-limit";
import type { TokenPort, TokenPurpose } from "../ports/token";
import type { UnitOfWork } from "../ports/unit-of-work";
import type { UserId } from "../value-objects/ids";
import type {
  IdentityResult,
  IdentityUseCases,
  ResetPasswordCommand,
  VerifyEmailCommand,
} from "./contract";

export interface IdentityUseCaseDependencies {
  readonly repository: IdentityRepository;
  readonly credentials: CredentialPort;
  readonly clock: ClockPort;
  readonly tokens: TokenPort;
  readonly notifications: NotificationPort;
  readonly rateLimit: RateLimitPort;
  readonly audit: AuditLogPort;
  readonly outbox: OutboxPort;
  readonly protocolRevocation: ProtocolRevocationPort;
  readonly unitOfWork: UnitOfWork;
}

export function createIdentityUseCases(deps: IdentityUseCaseDependencies): IdentityUseCases {
  return {
    async register(command) {
      const limited = await limit(deps, "registration", command.email.toString());
      if (limited !== null) return limited;
      return deps.unitOfWork.run(async (context) => {
        if ((await deps.repository.findSubjectByEmail(context, command.email)) !== null) {
          return rejected("conflict");
        }
        const subject = await deps.repository.createSubject(context, command);
        await deps.credentials.storePassword(context, subject.id, command.password);
        const token = await deps.tokens.issue({
          purpose: "email_verification",
          subject: subject.id,
        });
        await deps.repository.storeToken(context, {
          subjectId: subject.id,
          purpose: "email_verification",
          digest: token.digest,
          expiresAt: token.expiresAt,
        });
        await deps.notifications.enqueue({
          kind: "email_verification",
          recipient: subject.email,
          token: token.raw,
        });
        await recordMutation(deps, context, subject.id, "identity.registered");
        return accepted(subject);
      });
    },
    async verifyEmail(command) {
      return deps.unitOfWork.run(async (context) => {
        const subjectId = await consumeToken(deps, command, "email_verification", context);
        if (subjectId === null) return rejected("invalid_token");
        await deps.repository.setEmailVerified(context, subjectId);
        await recordMutation(deps, context, subjectId, "identity.email_verified");
        const subject = await deps.repository.findSubjectById(context, subjectId);
        return subject === null ? rejected("subject_not_found") : accepted(subject);
      });
    },
    async signIn(command) {
      const limited = await limit(deps, "sign_in", command.email.toString());
      if (limited !== null) return limited;
      return deps.unitOfWork.run(async (context) => {
        const subject = await deps.repository.findSubjectByEmail(context, command.email);
        if (
          subject === null ||
          !(await deps.credentials.verifyPassword(context, subject.id, command.password))
        ) {
          return rejected("invalid_credentials");
        }
        if (subject.state === "deactivated") return rejected("subject_deactivated");
        if (!subject.emailVerified) return rejected("unverified_email");
        return accepted(await deps.repository.createSession(context, subject.id, deps.clock.now()));
      });
    },
    async requestPasswordReset(command) {
      const limited = await limit(deps, "password_reset", command.email.toString());
      if (limited !== null) return limited;
      return deps.unitOfWork.run(async (context) => {
        const subject = await deps.repository.findSubjectByEmail(context, command.email);
        if (subject === null) return accepted(undefined);
        const token = await deps.tokens.issue({ purpose: "password_reset", subject: subject.id });
        await deps.repository.storeToken(context, {
          subjectId: subject.id,
          purpose: "password_reset",
          digest: token.digest,
          expiresAt: token.expiresAt,
        });
        await deps.notifications.enqueue({
          kind: "password_reset",
          recipient: subject.email,
          token: token.raw,
        });
        await recordMutation(deps, context, subject.id, "identity.password_reset_requested");
        return accepted(undefined);
      });
    },
    async resetPassword(command) {
      return deps.unitOfWork.run(async (context) => {
        const subjectId = await consumeToken(deps, command, "password_reset", context);
        if (subjectId === null) return rejected("invalid_token");
        await deps.credentials.storePassword(context, subjectId, command.newPassword);
        await deps.repository.revokeSubjectSessions(context, subjectId);
        await recordMutation(deps, context, subjectId, "identity.password_reset");
        return accepted(undefined);
      });
    },
    async deactivate(command) {
      return deps.unitOfWork.run(async (context) => {
        const subject = await deps.repository.findSubjectById(context, command.subjectId);
        if (subject === null) return rejected("subject_not_found");
        await deps.repository.deactivateSubject(context, command.subjectId);
        await deps.repository.revokeSubjectSessions(context, command.subjectId);
        await deps.protocolRevocation.subjectDeactivated(context, command);
        const occurredAt = deps.clock.now();
        await recordMutation(deps, context, command.subjectId, "identity.deactivated");
        return accepted({ subjectId: command.subjectId, occurredAt });
      });
    },
    async listSessions(subjectId) {
      return deps.unitOfWork.run(async (context) => {
        const subject = await deps.repository.findSubjectById(context, subjectId);
        if (subject === null) return rejected("subject_not_found");
        if (subject.state === "deactivated") return rejected("subject_deactivated");
        return accepted(await deps.repository.listSessions(context, subjectId));
      });
    },
    async revokeSession(command) {
      return deps.unitOfWork.run(async (context) => {
        const subject = await deps.repository.findSubjectById(context, command.subjectId);
        if (subject === null) return rejected("subject_not_found");
        await deps.repository.revokeSession(context, command.sessionId);
        await recordMutation(deps, context, command.subjectId, "identity.session_revoked");
        return accepted(undefined);
      });
    },
  };
}

async function consumeToken(
  deps: IdentityUseCaseDependencies,
  command: VerifyEmailCommand | ResetPasswordCommand,
  purpose: TokenPurpose,
  context: Parameters<AuditLogPort["record"]>[0],
): Promise<UserId | null> {
  const digest = await deps.tokens.digest(command.token);
  return deps.repository.consumeToken(context, { purpose, digest, now: deps.clock.now() });
}

async function limit(
  deps: IdentityUseCaseDependencies,
  action: "registration" | "sign_in" | "password_reset",
  key: string,
) {
  const decision = await deps.rateLimit.consume({ action, key });
  return decision.kind === "limited"
    ? ({ kind: "rejected", error: { kind: "rate_limited", retryAt: decision.retryAt } } as const)
    : null;
}

async function recordMutation(
  deps: IdentityUseCaseDependencies,
  context: Parameters<AuditLogPort["record"]>[0],
  subjectId: UserId,
  action: string,
): Promise<void> {
  const occurredAt = deps.clock.now();
  await deps.audit.record(context, {
    actorId: subjectId,
    action,
    targetType: "subject",
    targetId: subjectId,
    occurredAt,
  });
  await deps.outbox.enqueue(context, {
    idempotencyKey: `${action}:${subjectId}:${occurredAt.toISOString()}`,
    type: action,
    payload: { subjectId },
    occurredAt,
  });
}

function accepted<T>(value: T): IdentityResult<T> {
  return { kind: "accepted", value };
}

function rejected(
  kind:
    | "conflict"
    | "invalid_credentials"
    | "invalid_token"
    | "subject_deactivated"
    | "subject_not_found"
    | "unverified_email",
) {
  return { kind: "rejected", error: { kind } } as const;
}
