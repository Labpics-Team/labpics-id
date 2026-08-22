/**
 * Email-OTP use cases (CH08).
 *
 * Composition contract: `createOtpUseCases` is the production factory and
 * requires ALL seams — `accounts`, `audit`, `outbox`, `delivery` included —
 * so a composition that would silently drop the INV-20 audit/outbox evidence
 * trail or invent subject ids does not typecheck. Pure-domain contract
 * harnesses use `createOtpUseCasesForContractTests`, where those four seams
 * are optional (see its doc comment).
 */
import type { AuditLogPort } from "../ports/audit-log";
import type { ClockPort } from "../ports/clock";
import type { EmailDeliveryPort } from "../ports/email-delivery";
import type { IdentityRepository } from "../ports/identity";
import type { OtpChallengeStore, OtpCodePort } from "../ports/otp-challenge";
import type { OutboxPort } from "../ports/outbox";
import type { RateLimitPort } from "../ports/rate-limit";
import type { TransactionContext, UnitOfWork } from "../ports/unit-of-work";
import type { Email } from "../value-objects/email";
import { otpChallengeId, type UserId, userId } from "../value-objects/ids";
import type {
  EmployeeSubjectEnvelopeV1,
  OtpSessionOwner,
  OtpUseCases,
  RedeemOtpResult,
  RequestOtpResult,
  SourceIdentity,
} from "./otp-contract";

/**
 * Digest a raw challenge id to its sha-256 hex representation.
 * Used wherever the challenge id leaves the challenge-store boundary
 * (audit, outbox, rate-limit keys, delivery idempotency) so that the
 * raw opaque id never lands in a secondary store — matching the
 * challenge store's own digest scheme (INV-09).
 */
function digestChallengeId(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

/** Challenge lifetime: a code is redeemable for 10 minutes after issuance. */
export const OTP_CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** Wrong-code budget per challenge; exhaustion blocks even the correct code. */
export const OTP_MAX_ATTEMPTS = 5;
/** Earliest re-request interval surfaced as public `retryAt`. */
export const OTP_RETRY_INTERVAL_MS = 60 * 1000;

/** Production dependency set: every seam required — INV-20 evidence trail by construction. */
export interface OtpUseCaseDependencies {
  readonly challenges: OtpChallengeStore;
  readonly codes: OtpCodePort;
  readonly sessions: OtpSessionOwner;
  readonly rateLimit: RateLimitPort;
  readonly clock: ClockPort;
  readonly unitOfWork: UnitOfWork;
  readonly accounts: Pick<IdentityRepository, "findSubjectByEmail">;
  readonly audit: AuditLogPort;
  readonly outbox: OutboxPort;
  readonly delivery: EmailDeliveryPort;
}

/**
 * Contract-harness dependency set: `accounts`/`audit`/`outbox`/`delivery`
 * are optional so a pure in-memory harness can exercise the challenge
 * lifecycle alone. Never a production shape.
 */
export interface OtpContractTestDependencies {
  readonly challenges: OtpChallengeStore;
  readonly codes: OtpCodePort;
  readonly sessions: OtpSessionOwner;
  readonly rateLimit: RateLimitPort;
  readonly clock: ClockPort;
  readonly unitOfWork: UnitOfWork;
  /** Account lookup; when absent the subject id derives from the email (see `bindAccount`). */
  readonly accounts?: Pick<IdentityRepository, "findSubjectByEmail">;
  readonly audit?: AuditLogPort;
  readonly outbox?: OutboxPort;
  readonly delivery?: EmailDeliveryPort;
}

/** Production factory: all seams required, so the audit/outbox trail and the account-backed subject id cannot be lost by omission. */
export function createOtpUseCases(deps: OtpUseCaseDependencies): OtpUseCases {
  return buildOtpUseCases(deps);
}

/**
 * Factory for pure-domain CONTRACT TEST harnesses ONLY: the
 * `accounts`/`audit`/`outbox`/`delivery` seams may be omitted, and without
 * `accounts` the subject id derives deterministically from the email. This
 * derivation exists only here — production goes through `createOtpUseCases`,
 * which requires the account port. MUST NEVER be imported by apps/*.
 */
export function createOtpUseCasesForContractTests(deps: OtpContractTestDependencies): OtpUseCases {
  return buildOtpUseCases(deps);
}

function buildOtpUseCases(deps: OtpContractTestDependencies): OtpUseCases {
  return {
    /**
     * INV-12: unknown, deactivated, and existing accounts follow the same
     * code path — a challenge row is created either way, the public result
     * carries only policy-derived metadata, and delivery is dispatched
     * fire-and-forget AFTER the result is computed so response timing does
     * not encode account existence.
     */
    async requestOtp(command) {
      const limited = await deps.rateLimit.consume({
        action: "email_otp_request",
        key: command.email.value,
        source: command.source.ip,
      });
      if (limited.kind === "limited") {
        return { kind: "rate_limited", retryAt: limited.retryAt };
      }
      let issued: {
        readonly result: Extract<RequestOtpResult, { kind: "accepted" }>;
        readonly code: string;
        readonly deliver: boolean;
      };
      try {
        issued = await deps.unitOfWork.run(async (context) => {
          const now = deps.clock.now();
          const account = await resolveActiveAccount(deps, context, command.email);
          const generated = await deps.codes.generate();
          const challengeId = otpChallengeId(crypto.randomUUID());
          const expiresAt = new Date(now.getTime() + OTP_CHALLENGE_TTL_MS);
          await deps.challenges.create(context, {
            id: challengeId,
            email: command.email,
            purpose: "email_otp_login",
            accountId: account,
            codeDigest: generated.digest,
            createdAt: now,
            expiresAt,
            maxAttempts: OTP_MAX_ATTEMPTS,
          });
          await recordOtpEvent(deps, context, {
            action: "identity.otp.requested",
            actorId: account ?? "anonymous",
            challengeId,
            source: command.source,
            occurredAt: now,
          });
          return {
            result: {
              kind: "accepted",
              value: {
                challengeId,
                retryAt: new Date(now.getTime() + OTP_RETRY_INTERVAL_MS),
                expiresAt,
              },
            },
            code: generated.code,
            deliver: account !== null,
          } as const;
        });
      } catch {
        return { kind: "storage_unavailable" };
      }
      if (issued.deliver && deps.delivery !== undefined) {
        // Post-commit, not awaited: delivery latency and failures must not
        // alter the public result or its timing (INV-12). The durable trace
        // is the in-transaction outbox event; delivery-result tracking is a
        // later slice.
        void deps.delivery
          .send({
            idempotencyKey: `identity.otp.requested:${digestChallengeId(issued.result.value.challengeId)}`,
            to: command.email,
            purpose: "email_otp_login",
            code: issued.code,
            expiresAt: issued.result.value.expiresAt,
          })
          .catch(() => undefined);
      }
      return issued.result;
    },

    /**
     * INV-11: single-winner semantics live in the store's atomic consume.
     * INV-12: a consumed challenge with no bindable active account maps to
     * `invalid_code { remainingAttempts: 0 }` — indistinguishable from budget
     * exhaustion on a real account. `replayed` would be worse: it asserts a
     * prior successful consume and thus an existing account. Forged or
     * unknown challenge ids (`not_found`) map the same way. Fail-closed:
     * storage errors reject, never grant.
     */
    async redeemOtp(command) {
      const limited = await deps.rateLimit.consume({
        action: "email_otp_redeem",
        key: digestChallengeId(command.challengeId),
        source: command.source.ip,
      });
      if (limited.kind === "limited") {
        return rejectedRedeem({ kind: "rate_limited", retryAt: limited.retryAt });
      }
      try {
        return await deps.unitOfWork.run(async (context): Promise<RedeemOtpResult> => {
          const now = deps.clock.now();
          const codeDigest = await deps.codes.digest(command.code);
          const outcome = await deps.challenges.consume(context, {
            id: command.challengeId,
            purpose: "email_otp_login",
            codeDigest,
            now,
          });
          switch (outcome.kind) {
            case "consumed": {
              const accountId = await bindAccount(
                deps,
                context,
                outcome.challenge.accountId,
                outcome.challenge.email,
              );
              if (accountId === null) {
                return rejectedRedeem({ kind: "invalid_code", remainingAttempts: 0 });
              }
              const subject: EmployeeSubjectEnvelopeV1 = {
                schema_version: 1,
                kind: "employee",
                accountId,
                email: outcome.challenge.email,
              };
              const session = await deps.sessions.create(subject, now);
              await recordOtpEvent(deps, context, {
                action: "identity.otp.redeemed",
                actorId: accountId,
                challengeId: command.challengeId,
                source: command.source,
                occurredAt: now,
              });
              return { kind: "session_established", value: { session, subject } };
            }
            case "invalid_code":
              return rejectedRedeem({
                kind: "invalid_code",
                remainingAttempts: outcome.remainingAttempts,
              });
            case "expired":
              return rejectedRedeem({ kind: "expired" });
            case "already_consumed":
              return rejectedRedeem({ kind: "replayed" });
            case "not_found":
              return rejectedRedeem({ kind: "invalid_code", remainingAttempts: 0 });
          }
        });
      } catch {
        return rejectedRedeem({ kind: "storage_unavailable" });
      }
    },
  };
}

/**
 * Email -> active account id, or null for unknown/deactivated. Without an
 * account store the id derives from the email — the same derivation
 * `bindAccount` uses, so resolver-less request and redeem agree.
 */
async function resolveActiveAccount(
  deps: OtpContractTestDependencies,
  context: TransactionContext,
  email: Email,
): Promise<UserId | null> {
  if (deps.accounts === undefined) return derivedSubjectId(email);
  const subject = await deps.accounts.findSubjectByEmail(context, email);
  return subject !== null && subject.state === "active" ? subject.id : null;
}

/** Deterministic subject id for resolver-less composition (see module doc). */
function derivedSubjectId(email: Email): UserId {
  return userId(`employee:${email.value}`);
}

/**
 * Account binding at redeem, in precedence order:
 * 1. binding persisted at creation (`UserId`) — re-validated against the
 *    account store when one is wired (deactivation between request and
 *    redeem must not grant a session);
 * 2. persisted "no account" (`null`) — no session;
 * 3. binding not persisted (`undefined`): resolve now via the account store,
 *    or — with no store wired (pure-domain composition) — derive the subject
 *    id deterministically from the email. The derivation is the documented
 *    contract of resolver-less composition, not a silent fallback.
 */
async function bindAccount(
  deps: OtpContractTestDependencies,
  context: TransactionContext,
  persisted: UserId | null | undefined,
  email: Email,
): Promise<UserId | null> {
  if (persisted === null) return null;
  if (deps.accounts === undefined) {
    return persisted ?? derivedSubjectId(email);
  }
  const subject = await deps.accounts.findSubjectByEmail(context, email);
  if (subject === null || subject.state !== "active") return null;
  if (persisted !== undefined && subject.id !== persisted) return null;
  return subject.id;
}

/** Audit + outbox in the SAME transaction as the challenge mutation (INV-20/14). */
async function recordOtpEvent(
  deps: OtpContractTestDependencies,
  context: TransactionContext,
  event: {
    readonly action: "identity.otp.requested" | "identity.otp.redeemed";
    readonly actorId: string;
    readonly challengeId: string;
    readonly source: SourceIdentity;
    readonly occurredAt: Date;
  },
): Promise<void> {
  const challengeIdDigest = digestChallengeId(event.challengeId);
  await deps.audit?.record(context, {
    actorId: event.actorId,
    action: event.action,
    targetType: "otp_challenge",
    targetId: challengeIdDigest,
    occurredAt: event.occurredAt,
    ip: event.source.ip,
    ...(event.source.userAgent !== undefined ? { userAgent: event.source.userAgent } : {}),
  });
  await deps.outbox?.enqueue(context, {
    idempotencyKey: `${event.action}:${challengeIdDigest}`,
    type: event.action,
    payload: { challengeIdDigest },
    occurredAt: event.occurredAt,
  });
}

function rejectedRedeem(
  error: Extract<RedeemOtpResult, { kind: "rejected" }>["error"],
): RedeemOtpResult {
  return { kind: "rejected", error };
}