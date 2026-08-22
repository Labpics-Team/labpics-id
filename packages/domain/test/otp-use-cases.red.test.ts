/**
 * CH08 RED characterization tests: they specify the REQUIRED email-OTP
 * behavior against `createOtpUseCases`, whose implementation is still the
 * "not implemented" stub. Every test here must FAIL until the GREEN slice
 * lands; none may be skipped.
 */
import { describe, expect, it } from "bun:test";
import type {
  ConsumeOtpChallengeInput,
  ConsumeOtpChallengeOutcome,
  CreateOtpChallengeInput,
  EmployeeSubjectEnvelopeV1,
  OtpChallengeRecord,
  OtpChallengeStore,
  OtpCodePort,
  OtpSessionEstablished,
  OtpSessionOwner,
  RequestOtpResult,
  SessionView,
  SourceIdentity,
  TransactionContext,
} from "../src";
import { createOtpUseCasesForContractTests, Email } from "../src";

const SOURCE: SourceIdentity = { ip: "203.0.113.10" };

describe("OTP request (INV-12 enumeration resistance)", () => {
  it("returns a structurally identical accepted result for unknown and existing accounts", async () => {
    const harness = createOtpHarness();
    const known = await harness.useCases.requestOtp({
      email: Email.from("employee@labpics.dev"),
      source: SOURCE,
    });
    const unknown = await harness.useCases.requestOtp({
      email: Email.from("nobody@labpics.dev"),
      source: SOURCE,
    });
    expect(known.kind).toBe("accepted");
    expect(unknown.kind).toBe("accepted");
    expect(shapeOf(known)).toEqual(shapeOf(unknown));
  });
});

describe("OTP redeem lifecycle", () => {
  it("establishes a session carrying EmployeeSubjectEnvelopeV1 on a valid code", async () => {
    const harness = createOtpHarness();
    const accepted = await requestAccepted(harness, "employee@labpics.dev");
    const result = await harness.useCases.redeemOtp({
      challengeId: accepted.challengeId,
      code: harness.lastIssuedCode(),
      source: SOURCE,
    });
    expect(result.kind).toBe("session_established");
    if (result.kind !== "session_established") throw new Error("expected session");
    const subject: EmployeeSubjectEnvelopeV1 = result.value.subject;
    expect(subject.schema_version).toBe(1);
    expect(subject.kind).toBe("employee");
    expect(subject.email.value).toBe("employee@labpics.dev");
  });

  it("rejects an expired challenge with kind=expired", async () => {
    const harness = createOtpHarness();
    const accepted = await requestAccepted(harness, "employee@labpics.dev");
    harness.advanceTo(new Date(accepted.expiresAt.getTime() + 1_000));
    const result = await harness.useCases.redeemOtp({
      challengeId: accepted.challengeId,
      code: harness.lastIssuedCode(),
      source: SOURCE,
    });
    expect(result).toEqual({ kind: "rejected", error: { kind: "expired" } });
  });

  it("rejects a replay of an already-consumed challenge", async () => {
    const harness = createOtpHarness();
    const accepted = await requestAccepted(harness, "employee@labpics.dev");
    const code = harness.lastIssuedCode();
    const first = await harness.useCases.redeemOtp({
      challengeId: accepted.challengeId,
      code,
      source: SOURCE,
    });
    expect(first.kind).toBe("session_established");
    const replay = await harness.useCases.redeemOtp({
      challengeId: accepted.challengeId,
      code,
      source: SOURCE,
    });
    expect(replay).toEqual({ kind: "rejected", error: { kind: "replayed" } });
  });

  it("binds the code to its own challenge: a code issued for one challenge does not redeem another", async () => {
    const harness = createOtpHarness();
    const first = await requestAccepted(harness, "employee@labpics.dev");
    const firstCode = harness.lastIssuedCode();
    const second = await requestAccepted(harness, "other@labpics.dev");
    expect(second.challengeId).not.toBe(first.challengeId);
    const crossed = await harness.useCases.redeemOtp({
      challengeId: second.challengeId,
      code: firstCode,
      source: SOURCE,
    });
    expect(crossed.kind).toBe("rejected");
    if (crossed.kind !== "rejected") throw new Error("expected rejection");
    expect(crossed.error.kind).toBe("invalid_code");
  });
});

describe("OTP challenge independence (INV-13)", () => {
  it("a new request does not revoke a prior unexpired challenge", async () => {
    const harness = createOtpHarness();
    const first = await requestAccepted(harness, "employee@labpics.dev");
    const firstCode = harness.lastIssuedCode();
    await requestAccepted(harness, "employee@labpics.dev");
    const result = await harness.useCases.redeemOtp({
      challengeId: first.challengeId,
      code: firstCode,
      source: SOURCE,
    });
    expect(result.kind).toBe("session_established");
  });

  it("wrong attempts on one challenge do not consume the budget of another", async () => {
    const harness = createOtpHarness();
    const victim = await requestAccepted(harness, "employee@labpics.dev");
    const victimCode = harness.lastIssuedCode();
    const attacked = await requestAccepted(harness, "employee@labpics.dev");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await harness.useCases.redeemOtp({
        challengeId: attacked.challengeId,
        code: "000000",
        source: SOURCE,
      });
    }
    const result = await harness.useCases.redeemOtp({
      challengeId: victim.challengeId,
      code: victimCode,
      source: SOURCE,
    });
    expect(result.kind).toBe("session_established");
  });
});

describe("OTP single-winner concurrency (INV-11)", () => {
  it("exactly one of two concurrent redeems with the correct code wins", async () => {
    const harness = createOtpHarness();
    const accepted = await requestAccepted(harness, "employee@labpics.dev");
    const code = harness.lastIssuedCode();
    const command = { challengeId: accepted.challengeId, code, source: SOURCE };
    const [a, b] = await Promise.all([
      harness.useCases.redeemOtp(command),
      harness.useCases.redeemOtp(command),
    ]);
    const winners = [a, b].filter((result) => result.kind === "session_established");
    const losers = [a, b].filter(
      (result) => result.kind === "rejected" && result.error.kind === "replayed",
    );
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
  });
});

async function requestAccepted(harness: OtpHarness, email: string) {
  const result = await harness.useCases.requestOtp({ email: Email.from(email), source: SOURCE });
  if (result.kind !== "accepted") throw new Error(`expected accepted, got ${result.kind}`);
  return result.value;
}

/** Sorted key list of a public result — the enumeration-uniformity witness. */
function shapeOf(result: RequestOtpResult): readonly string[] {
  if (result.kind !== "accepted") return [result.kind];
  return Object.keys(result.value).sort();
}

type OtpHarness = ReturnType<typeof createOtpHarness>;

function createOtpHarness() {
  let now = new Date("2026-08-22T00:00:00.000Z");
  let issuedCodes = 0;
  let lastCode = "";
  const challenges = new Map<string, { record: OtpChallengeRecord; consumed: boolean }>();
  const sessions = new Map<string, OtpSessionEstablished>();

  const store: OtpChallengeStore = {
    async create(_context: TransactionContext, input: CreateOtpChallengeInput) {
      const record: OtpChallengeRecord = {
        id: input.id,
        email: input.email,
        purpose: input.purpose,
        codeDigest: input.codeDigest,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        remainingAttempts: input.maxAttempts,
      };
      challenges.set(input.id, { record, consumed: false });
      return record;
    },
    async consume(
      _context: TransactionContext,
      input: ConsumeOtpChallengeInput,
    ): Promise<ConsumeOtpChallengeOutcome> {
      const entry = challenges.get(input.id);
      if (entry === undefined || entry.record.purpose !== input.purpose) {
        return { kind: "not_found" };
      }
      if (entry.consumed) return { kind: "already_consumed" };
      if (entry.record.expiresAt.getTime() <= input.now.getTime()) return { kind: "expired" };
      if (entry.record.remainingAttempts <= 0) return { kind: "not_found" };
      if (entry.record.codeDigest !== input.codeDigest) {
        const remainingAttempts = entry.record.remainingAttempts - 1;
        entry.record = { ...entry.record, remainingAttempts };
        return { kind: "invalid_code", remainingAttempts };
      }
      entry.consumed = true;
      return { kind: "consumed", challenge: entry.record };
    },
  };

  const codes: OtpCodePort = {
    async generate() {
      issuedCodes += 1;
      lastCode = String(100000 + issuedCodes);
      return { code: lastCode, digest: `digest:${lastCode}` };
    },
    async digest(code: string) {
      return `digest:${code}`;
    },
  };

  const sessionOwner: OtpSessionOwner = {
    async create(subject: EmployeeSubjectEnvelopeV1, authenticatedAt: Date) {
      const session: SessionView = {
        id: `session-${sessions.size + 1}`,
        subjectId: subject.accountId,
        authenticatedAt,
        expiresAt: new Date(authenticatedAt.getTime() + 3_600_000),
        authenticationMethods: ["email_otp"],
        state: "active",
      };
      sessions.set(session.id, { session, subject });
      return session;
    },
    async resolve(credential: string) {
      return sessions.get(credential) ?? null;
    },
    async rotate(sessionId: string) {
      const existing = sessions.get(sessionId);
      if (existing === undefined) throw new Error(`missing session ${sessionId}`);
      return existing.session;
    },
    async revoke(sessionId: string) {
      sessions.delete(sessionId);
    },
  };

  const useCases = createOtpUseCasesForContractTests({
    challenges: store,
    codes,
    sessions: sessionOwner,
    rateLimit: { consume: async () => ({ kind: "allowed" }) },
    clock: { now: () => now },
    unitOfWork: {
      run: async (work) => work({ transactionId: crypto.randomUUID() }),
    },
  });

  return {
    useCases,
    lastIssuedCode: () => lastCode,
    advanceTo: (next: Date) => {
      now = next;
    },
  };
}
