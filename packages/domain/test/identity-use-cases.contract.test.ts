import { describe, it } from "bun:test";
import type {
  CredentialPort,
  IdentityRepository,
  IdentityUseCaseDependencies,
  SessionView,
  SubjectView,
  TokenPurpose,
  TransactionContext,
  UserId,
} from "../src";
import { createIdentityUseCases, userId } from "../src";
import { runIdentityUseCaseContract } from "./identity-contract-harness";

describe("IdentityUseCases shared contract", () => {
  it("runs every use case through the in-memory adapter", async () => {
    const harness = createMemoryHarness();
    await runIdentityUseCaseContract(harness);
  });
});

function createMemoryHarness() {
  const subjects = new Map<string, SubjectView>();
  const passwords = new Map<string, string>();
  const sessions = new Map<string, SessionView>();
  const tokens = new Map<TokenPurpose, { raw: string; subjectId: UserId }>();
  const repository: IdentityRepository = {
    findSubjectById: async (_context, subjectId) => subjects.get(subjectId) ?? null,
    findSubjectByEmail: async (_context, email) =>
      [...subjects.values()].find((subject) => subject.email.equals(email)) ?? null,
    createSubject: async (_context, command) => {
      const subject = {
        id: userId(`subject-${subjects.size + 1}`),
        email: command.email,
        emailVerified: false,
        state: "active",
      } satisfies SubjectView;
      subjects.set(subject.id, subject);
      return subject;
    },
    setEmailVerified: async (_context, subjectId) => {
      const subject = requireSubject(subjects, subjectId);
      subjects.set(subjectId, { ...subject, emailVerified: true });
    },
    storeToken: async (_context, input) => {
      const token = tokens.get(input.purpose);
      if (token !== undefined) tokens.set(input.purpose, { ...token, subjectId: input.subjectId });
    },
    consumeToken: async (_context, input) => {
      const token = tokens.get(input.purpose);
      return token?.raw === input.digest ? token.subjectId : null;
    },
    createSession: async (_context, subjectId, authenticatedAt) => {
      const session = {
        id: `session-${sessions.size + 1}`,
        subjectId,
        authenticatedAt,
        expiresAt: new Date(authenticatedAt.getTime() + 3_600_000),
        authenticationMethods: ["password"],
        state: "active",
      } satisfies SessionView;
      sessions.set(session.id, session);
      return session;
    },
    deactivateSubject: async (_context, subjectId) => {
      const subject = requireSubject(subjects, subjectId);
      subjects.set(subjectId, { ...subject, state: "deactivated" });
    },
    listSessions: async (_context, subjectId) =>
      [...sessions.values()].filter((session) => session.subjectId === subjectId),
    revokeSession: async (_context, sessionId) => {
      const session = sessions.get(sessionId);
      if (session !== undefined) sessions.set(sessionId, { ...session, state: "revoked" });
    },
    revokeSubjectSessions: async (_context, subjectId) => {
      for (const [id, session] of sessions) {
        if (session.subjectId === subjectId) sessions.set(id, { ...session, state: "revoked" });
      }
    },
  };
  const credentials: CredentialPort = {
    storePassword: async (_context, subjectId, password) => {
      passwords.set(subjectId, password);
    },
    verifyPassword: async (_context, subjectId, password) => passwords.get(subjectId) === password,
  };
  const deps: IdentityUseCaseDependencies = {
    repository,
    credentials,
    clock: { now: () => new Date("2026-08-12T00:00:00.000Z") },
    tokens: {
      issue: async (command) => {
        const raw = `${command.purpose}-token`;
        tokens.set(command.purpose, { raw, subjectId: userId(command.subject) });
        return { raw, digest: raw, expiresAt: new Date("2026-08-13T00:00:00.000Z") };
      },
      digest: async (raw) => raw,
    },
    notifications: { enqueue: async () => undefined },
    rateLimit: { consume: async () => ({ kind: "allowed" }) },
    audit: { record: async () => undefined },
    outbox: { enqueue: async () => undefined },
    protocolRevocation: { subjectDeactivated: async () => undefined },
    unitOfWork: {
      run: async (work) =>
        work({ transactionId: crypto.randomUUID() } satisfies TransactionContext),
    },
  };
  return {
    useCases: createIdentityUseCases(deps),
    token: (kind: TokenPurpose) => tokens.get(kind)?.raw ?? "missing-token",
  };
}

function requireSubject(
  subjects: ReadonlyMap<string, SubjectView>,
  subjectId: UserId,
): SubjectView {
  const subject = subjects.get(subjectId);
  if (subject === undefined) throw new Error(`missing subject ${subjectId}`);
  return subject;
}
