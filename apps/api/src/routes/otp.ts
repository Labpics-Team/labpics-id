import type { ErrorEnvelope } from "@labpics/contracts";
import type { OtpUseCases, SourceIdentity } from "@labpics/domain";
import { Email, otpChallengeId } from "@labpics/domain";
import { Hono } from "hono";
import type { AppVariables } from "../types";

/**
 * Email-OTP routes (CH08, plan REQ-01/AUTH-01).
 *
 * NOT registered in the production composition (`createApp`) — plan gate
 * "Intermediate-main: no registered production OTP route". Test compositions
 * mount this factory explicitly; production mounting is the AUTH-01
 * activation slice.
 *
 * Enumeration resistance at the HTTP level (INV-12): the 202 acceptance is
 * structurally identical for unknown, deactivated, and existing accounts.
 * Syntactic email validation is the deliberate exception — a 400 for a
 * malformed address reveals nothing about ACCOUNT existence (the attacker
 * already knows the string is not a valid address), so syntax errors reject
 * loudly while existence stays uniform.
 */
export interface OtpRouteDeps {
  readonly otp: OtpUseCases;
}

export function otpRoutes(deps: OtpRouteDeps) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.post("/v1/auth/otp/request", async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null || typeof body.email !== "string") {
      return c.json(validationError("email is required"), 400);
    }
    let email: Email;
    try {
      email = Email.from(body.email);
    } catch {
      return c.json(validationError("email is not a valid address"), 400);
    }
    const result = await deps.otp.requestOtp({ email, source: sourceOf(c.req.raw.headers) });
    switch (result.kind) {
      case "accepted":
        return c.json(
          {
            challengeId: result.value.challengeId,
            retryAt: result.value.retryAt.toISOString(),
            expiresAt: result.value.expiresAt.toISOString(),
          },
          202,
        );
      case "rate_limited":
        return rateLimited(result.retryAt);
      case "storage_unavailable":
        return c.json(storageUnavailable(), 503);
    }
  });

  app.post("/v1/auth/otp/redeem", async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null || typeof body.challengeId !== "string" || typeof body.code !== "string") {
      return c.json(validationError("challengeId and code are required"), 400);
    }
    const result = await deps.otp.redeemOtp({
      challengeId: otpChallengeId(body.challengeId),
      code: body.code,
      source: sourceOf(c.req.raw.headers),
    });
    if (result.kind === "session_established") {
      // TODO(AUTH-01): session cookie issuance via the session owner lands
      // with the AUTH-01 activation slice; until then the response carries
      // the subject DTO only and MUST NOT set cookies.
      //
      // Wire DTO is deliberately decoupled from the internal
      // EmployeeSubjectEnvelopeV1 (Hyrum): `schema_version`/`kind` stay
      // internal so envelope evolution (V2/CH05) is not a public API break.
      return c.json(
        {
          subject: {
            accountId: result.value.subject.accountId,
            email: result.value.subject.email.value,
          },
        },
        200,
      );
    }
    const failure = result.error;
    switch (failure.kind) {
      case "expired":
        return c.json(redeemError("expired"), 410);
      case "invalid_code":
        return c.json(
          { ...redeemError("invalid_code"), remainingAttempts: failure.remainingAttempts },
          401,
        );
      case "replayed":
        // The kind is part of the public contract (RedeemOtpFailure); the
        // status matches invalid_code so transport-level probes see one class.
        return c.json(redeemError("replayed"), 401);
      case "rate_limited":
        return rateLimited(failure.retryAt);
      case "storage_unavailable":
        return c.json(storageUnavailable(), 503);
    }
  });

  return app;
}

/**
 * Traefik single-hop contract: the first x-forwarded-for entry is the client
 * address appended by our own edge; the header is stripped/rewritten there,
 * so the first hop is trustworthy.
 */
function sourceOf(headers: Headers): SourceIdentity {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = headers.get("user-agent");
  return {
    ip: forwarded !== undefined && forwarded.length > 0 ? forwarded : "unknown",
    ...(userAgent !== null ? { userAgent } : {}),
  };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function rateLimited(retryAt: Date): Response {
  const seconds = Math.max(0, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { ...redeemError("rate_limited"), retryAt: retryAt.toISOString() },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

function validationError(message: string): ErrorEnvelope {
  return { error: { code: "validation_error", message } };
}

function redeemError(code: string): ErrorEnvelope {
  return { error: { code, message: "OTP request rejected" } };
}

function storageUnavailable(): ErrorEnvelope {
  return { error: { code: "storage_unavailable", message: "Service temporarily unavailable" } };
}
