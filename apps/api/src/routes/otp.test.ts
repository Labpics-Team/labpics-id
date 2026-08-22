import { describe, expect, it } from "bun:test";
import type {
  OtpUseCases,
  RedeemOtpFailure,
  RedeemOtpResult,
  RequestOtpResult,
} from "@labpics/domain";
import { Email, otpChallengeId, userId } from "@labpics/domain";
import { otpRoutes } from "./otp";

const RETRY_AT = new Date("2026-08-22T00:01:00.000Z");
const EXPIRES_AT = new Date("2026-08-22T00:10:00.000Z");

function appWith(useCases: Partial<OtpUseCases>) {
  const otp: OtpUseCases = {
    requestOtp: useCases.requestOtp ?? (async () => acceptedResult()),
    redeemOtp:
      useCases.redeemOtp ??
      (async () => ({ kind: "rejected", error: { kind: "expired" } }) satisfies RedeemOtpResult),
  };
  return otpRoutes({ otp });
}

function acceptedResult(): RequestOtpResult {
  return {
    kind: "accepted",
    value: { challengeId: otpChallengeId("challenge-1"), retryAt: RETRY_AT, expiresAt: EXPIRES_AT },
  };
}

function sessionResult(): RedeemOtpResult {
  const subject = {
    schema_version: 1,
    kind: "employee",
    accountId: userId("account-1"),
    email: Email.from("employee@labpics.dev"),
  } as const;
  return {
    kind: "session_established",
    value: {
      subject,
      session: {
        id: "session-1",
        subjectId: subject.accountId,
        authenticatedAt: new Date("2026-08-22T00:00:00.000Z"),
        expiresAt: new Date("2026-08-22T01:00:00.000Z"),
        authenticationMethods: ["email_otp"],
        state: "active",
      },
    },
  };
}

function rejected(error: RedeemOtpFailure): RedeemOtpResult {
  return { kind: "rejected", error };
}

function postJson(app: ReturnType<typeof otpRoutes>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify(body),
  });
}

describe("POST /v1/auth/otp/request", () => {
  it("returns a byte-identical 202 schema for known and unknown emails (INV-12)", async () => {
    const app = appWith({ requestOtp: async () => acceptedResult() });
    const known = await postJson(app, "/v1/auth/otp/request", { email: "employee@labpics.dev" });
    const unknown = await postJson(app, "/v1/auth/otp/request", { email: "nobody@labpics.dev" });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    const knownBody = (await known.json()) as Record<string, unknown>;
    const unknownBody = (await unknown.json()) as Record<string, unknown>;
    expect(Object.keys(knownBody).sort()).toEqual(Object.keys(unknownBody).sort());
    expect(knownBody).toEqual({
      challengeId: "challenge-1",
      retryAt: RETRY_AT.toISOString(),
      expiresAt: EXPIRES_AT.toISOString(),
    });
  });

  it("rejects a syntactically invalid email with a 400 validation envelope", async () => {
    const app = appWith({});
    const res = await postJson(app, "/v1/auth/otp/request", { email: "not-an-email" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("rejects a missing email with 400", async () => {
    const app = appWith({});
    const res = await postJson(app, "/v1/auth/otp/request", {});
    expect(res.status).toBe(400);
  });

  it("maps rate_limited to 429 with Retry-After header", async () => {
    const retryAt = new Date(Date.now() + 60_000);
    const app = appWith({ requestOtp: async () => ({ kind: "rate_limited", retryAt }) });
    const res = await postJson(app, "/v1/auth/otp/request", { email: "employee@labpics.dev" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("maps storage_unavailable to 503", async () => {
    const app = appWith({ requestOtp: async () => ({ kind: "storage_unavailable" }) });
    const res = await postJson(app, "/v1/auth/otp/request", { email: "employee@labpics.dev" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("storage_unavailable");
  });

  it("passes the first x-forwarded-for hop and user-agent as SourceIdentity", async () => {
    const seen: Array<{ ip: string; userAgent?: string }> = [];
    const app = appWith({
      requestOtp: async (command) => {
        seen.push(command.source);
        return acceptedResult();
      },
    });
    await app.request("/v1/auth/otp/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.7, 10.0.0.1",
        "user-agent": "test-agent/1.0",
      },
      body: JSON.stringify({ email: "employee@labpics.dev" }),
    });
    expect(seen).toEqual([{ ip: "198.51.100.7", userAgent: "test-agent/1.0" }]);
  });
});

describe("POST /v1/auth/otp/redeem", () => {
  it("returns 200 with the schema_version 1 employee subject envelope", async () => {
    const app = appWith({ redeemOtp: async () => sessionResult() });
    const res = await postJson(app, "/v1/auth/otp/redeem", {
      challengeId: "challenge-1",
      code: "100001",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      subject: {
        schema_version: 1,
        kind: "employee",
        accountId: "account-1",
        email: "employee@labpics.dev",
      },
    });
  });

  it("rejects missing fields with 400", async () => {
    const app = appWith({});
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "challenge-1" });
    expect(res.status).toBe(400);
  });

  it("maps expired to 410", async () => {
    const app = appWith({ redeemOtp: async () => rejected({ kind: "expired" }) });
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" });
    expect(res.status).toBe(410);
  });

  it("maps invalid_code to 401 with remainingAttempts", async () => {
    const app = appWith({
      redeemOtp: async () => rejected({ kind: "invalid_code", remainingAttempts: 3 }),
    });
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string }; remainingAttempts: number };
    expect(body.error.code).toBe("invalid_code");
    expect(body.remainingAttempts).toBe(3);
  });

  it("maps replayed to 401 with the typed kind", async () => {
    const app = appWith({ redeemOtp: async () => rejected({ kind: "replayed" }) });
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("replayed");
  });

  it("maps rate_limited to 429 with Retry-After", async () => {
    const retryAt = new Date(Date.now() + 30_000);
    const app = appWith({ redeemOtp: async () => rejected({ kind: "rate_limited", retryAt }) });
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("maps storage_unavailable to 503", async () => {
    const app = appWith({ redeemOtp: async () => rejected({ kind: "storage_unavailable" }) });
    const res = await postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" });
    expect(res.status).toBe(503);
  });
});

describe("cookie discipline (AUTH-01 not yet active)", () => {
  it("sets no cookie on any OTP response", async () => {
    const app = appWith({ redeemOtp: async () => sessionResult() });
    const responses = await Promise.all([
      postJson(app, "/v1/auth/otp/request", { email: "employee@labpics.dev" }),
      postJson(app, "/v1/auth/otp/redeem", { challengeId: "c", code: "1" }),
      postJson(app, "/v1/auth/otp/request", { email: "bad" }),
    ]);
    for (const res of responses) {
      expect(res.headers.get("Set-Cookie")).toBeNull();
    }
  });
});
