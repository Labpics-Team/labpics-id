import { describe, expect, it } from "bun:test";
import type {
  ClockPort,
  DeactivateSubjectCommand,
  IdentityAuthPort,
  IdentityRepository,
  NotificationPort,
  RateLimitPort,
  RegisterSubjectCommand,
  SessionView,
  SubjectView,
  TokenPort,
  TransactionContext,
} from "../src";
import { Email, userId } from "../src";

describe("identity application boundary", () => {
  it("keeps commands and subject/session results adapter-neutral", async () => {
    const subject: SubjectView = {
      id: userId("subject-1"),
      email: Email.from("USER@example.com"),
      emailVerified: true,
      state: "active",
    };
    const session: SessionView = {
      id: "session-1",
      subjectId: subject.id,
      authenticatedAt: new Date("2026-08-12T00:00:00.000Z"),
      expiresAt: new Date("2026-08-12T01:00:00.000Z"),
      authenticationMethods: ["password"],
      state: "active",
    };
    const auth: IdentityAuthPort = {
      resolveSession: async () => ({ kind: "authenticated", subject, session }),
      reauthenticate: async () => ({ kind: "authenticated", subject, session }),
      revokeSubjectSessions: async () => undefined,
    };

    const resolved = await auth.resolveSession({ credential: "opaque-session" });

    expect(resolved).toEqual({ kind: "authenticated", subject, session });
    expect(subject.email.toString()).toBe("user@example.com");
  });

  it("threads one transaction context through every mutating secondary port", async () => {
    const context: TransactionContext = { transactionId: "tx-identity" };
    const observed: TransactionContext[] = [];
    const repository: IdentityRepository = {
      findSubjectByEmail: async () => null,
      createSubject: async (received) => {
        observed.push(received);
        return userId("subject-1");
      },
      setEmailVerified: async (received) => {
        observed.push(received);
      },
      deactivateSubject: async (received) => {
        observed.push(received);
      },
      listSessions: async () => [],
      revokeSession: async (received) => {
        observed.push(received);
      },
      revokeSubjectSessions: async (received) => {
        observed.push(received);
      },
    };
    const command: RegisterSubjectCommand = {
      email: Email.from("user@example.com"),
      name: "User",
      password: "opaque-password",
    };
    const deactivate: DeactivateSubjectCommand = { subjectId: userId("subject-1") };

    await repository.createSubject(context, command);
    await repository.deactivateSubject(context, deactivate.subjectId);

    expect(observed).toEqual([context, context]);
  });

  it("defines narrow clock, token, notification, and rate-limit capabilities", async () => {
    const clock: ClockPort = { now: () => new Date("2026-08-12T00:00:00.000Z") };
    const tokens: TokenPort = {
      issue: async () => ({ raw: "deliver-once", digest: "persist-only", expiresAt: clock.now() }),
    };
    const notifications: NotificationPort = { enqueue: async () => undefined };
    const rateLimit: RateLimitPort = { consume: async () => ({ kind: "allowed" }) };

    const token = await tokens.issue({ purpose: "email_verification", subject: "subject-1" });
    await notifications.enqueue({
      kind: "email_verification",
      recipient: Email.from("user@example.com"),
      token: token.raw,
    });

    expect(token.digest).toBe("persist-only");
    expect(await rateLimit.consume({ action: "registration", key: "source-1" })).toEqual({
      kind: "allowed",
    });
  });
});
