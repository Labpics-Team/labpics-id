import { describe, expect, it } from "bun:test";
import type { IdentityAction, RateLimitAttempt, UnitOfWork } from "../src";
import {
  bootstrapClaimBudget,
  createIdentityUseCases,
  Email,
  verificationResendBudget,
} from "../src";

describe("protected identity action budgets", () => {
  it("invokes every lifecycle budget with the named action", async () => {
    const attempts: RateLimitAttempt[] = [];
    const rateLimit = {
      consume: async (attempt: RateLimitAttempt) => {
        attempts.push(attempt);
        return { kind: "allowed" } as const;
      },
    };
    const deps = {
      repository: {
        findSubjectById: async () => null,
        findSubjectByEmail: async () => ({
          id: (await import("../src")).userId("subject"),
          email: Email.from("user@example.com"),
          emailVerified: true,
          state: "active" as const,
        }),
        createSubject: async () => {
          throw new Error("not reached");
        },
        setEmailVerified: async () => undefined,
        storeToken: async () => undefined,
        consumeToken: async () => null,
        createSession: async () => {
          throw new Error("not reached");
        },
        deactivateSubject: async () => undefined,
        listSessions: async () => [],
        revokeSession: async () => undefined,
        revokeSubjectSessions: async () => undefined,
      },
      credentials: { storePassword: async () => undefined, verifyPassword: async () => false },
      clock: { now: () => new Date() },
      tokens: {
        issue: async () => ({ raw: "token", digest: "digest", expiresAt: new Date() }),
        digest: async (raw: string) => raw,
      },
      notifications: { enqueue: async () => undefined },
      rateLimit,
      audit: { record: async () => undefined },
      outbox: { enqueue: async () => undefined },
      protocolRevocation: { subjectDeactivated: async () => undefined },
      unitOfWork: {
        run: async <T>(work: (context: { transactionId: string }) => Promise<T>): Promise<T> =>
          work({ transactionId: "tx" }),
      } satisfies UnitOfWork,
    };
    const useCases = createIdentityUseCases(deps);
    await useCases.register({
      email: Email.from("user@example.com"),
      name: "User",
      password: "secret",
    });
    await useCases.signIn({ email: Email.from("user@example.com"), password: "secret" });
    await useCases.requestPasswordReset({ email: Email.from("user@example.com") });
    await useCases.verifyEmail({ token: "verify" });
    await useCases.resetPassword({ token: "reset", newPassword: "secret" });
    await verificationResendBudget({ rateLimit }, "user@example.com", "source");
    await bootstrapClaimBudget({ rateLimit }, "user@example.com", "source");

    const actions = attempts.map((attempt) => attempt.action);
    for (const action of [
      "registration",
      "sign_in",
      "password_reset",
      "verification_consume",
      "password_reset_consume",
      "verification_resend",
      "bootstrap_claim",
    ] satisfies IdentityAction[]) {
      expect(actions).toContain(action);
    }
  });
});
