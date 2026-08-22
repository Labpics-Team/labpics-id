import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { Email, type OtpEmailMessage } from "@labpics/domain";
import { delay, HttpResponse, http, setupServer } from "@labpics/testkit";
import { createResendEmailDelivery } from "./resend.adapter";

const BASE_URL = "http://resend.test";
const SEND_URL = `${BASE_URL}/emails`;
const OTP_CODE = "483920";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function adapter(overrides: { timeoutMs?: number } = {}) {
  return createResendEmailDelivery({
    apiKeyRef: () => "re_test_key",
    from: "Labpics ID <id@lab.pics>",
    baseUrl: BASE_URL,
    timeoutMs: overrides.timeoutMs ?? 5_000,
  });
}

function otpMessage(
  overrides: Partial<Pick<OtpEmailMessage, "idempotencyKey">> = {},
): OtpEmailMessage {
  return {
    idempotencyKey: overrides.idempotencyKey ?? `otp-login/${crypto.randomUUID()}`,
    to: Email.from("employee@lab.pics"),
    purpose: "email_otp_login",
    code: OTP_CODE,
    expiresAt: new Date("2026-08-22T12:10:00.000Z"),
  };
}

describe("Resend email delivery adapter", () => {
  it("delivers and reports the provider message id", async () => {
    server.use(http.post(SEND_URL, () => HttpResponse.json({ id: "msg-first" }, { status: 200 })));

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "delivered", providerMessageId: "msg-first", duplicate: false });
  });

  it("resolves a duplicate send (same idempotency key) to the SAME provider message id", async () => {
    const seenIds = new Map<string, string>();
    server.use(
      http.post(SEND_URL, ({ request }) => {
        const key = request.headers.get("idempotency-key");
        if (key === null) {
          return HttpResponse.json({ name: "validation_error" }, { status: 422 });
        }
        const existing = seenIds.get(key);
        if (existing !== undefined) {
          // Resend replays the original response for a repeated key+payload.
          return HttpResponse.json({ id: existing }, { status: 200 });
        }
        const id = `msg-${seenIds.size + 1}`;
        seenIds.set(key, id);
        return HttpResponse.json({ id }, { status: 200 });
      }),
    );
    const port = adapter();
    const message = otpMessage({ idempotencyKey: "otp-login/replay-case" });

    const first = await port.send(message);
    const second = await port.send(message);

    expect(first.kind).toBe("delivered");
    expect(second.kind).toBe("delivered");
    if (first.kind === "delivered" && second.kind === "delivered") {
      expect(second.providerMessageId).toBe(first.providerMessageId);
    }
    expect(seenIds.size).toBe(1);
  });

  it("classifies a network timeout as retryable timeout", async () => {
    server.use(
      http.post(SEND_URL, async () => {
        await delay(5_000);
        return HttpResponse.json({ id: "too-late" }, { status: 200 });
      }),
    );

    const result = await adapter({ timeoutMs: 50 }).send(otpMessage());

    expect(result).toEqual({ kind: "retryable", reason: "timeout" });
  });

  it("classifies 429 with Retry-After as retryable rate_limited with retryAt", async () => {
    server.use(
      http.post(SEND_URL, () =>
        HttpResponse.json(
          { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" },
          { status: 429, headers: { "retry-after": "7" } },
        ),
      ),
    );
    const before = Date.now();

    const result = await adapter().send(otpMessage());

    expect(result.kind).toBe("retryable");
    if (result.kind === "retryable") {
      expect(result.reason).toBe("rate_limited");
      expect(result.retryAt).toBeInstanceOf(Date);
      const retryAtMs = result.retryAt?.getTime() ?? 0;
      expect(retryAtMs).toBeGreaterThanOrEqual(before + 7_000);
      expect(retryAtMs).toBeLessThanOrEqual(Date.now() + 7_000);
    }
  });

  it("classifies an idempotency payload mismatch (409 invalid_idempotent_request) as terminal", async () => {
    server.use(
      http.post(SEND_URL, () =>
        HttpResponse.json(
          {
            name: "invalid_idempotent_request",
            statusCode: 409,
            message: "Idempotency key already used with a different payload",
          },
          { status: 409 },
        ),
      ),
    );

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "terminal", reason: "payload_mismatch" });
  });

  it("treats a concurrent idempotent request (409) as retryable, not terminal", async () => {
    server.use(
      http.post(SEND_URL, () =>
        HttpResponse.json(
          { name: "concurrent_idempotent_requests", statusCode: 409, message: "In progress" },
          { status: 409 },
        ),
      ),
    );

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "retryable", reason: "server_error" });
  });

  it("classifies 422 validation errors as terminal invalid_recipient", async () => {
    server.use(
      http.post(SEND_URL, () =>
        HttpResponse.json(
          { name: "validation_error", statusCode: 422, message: "Invalid `to` address" },
          { status: 422 },
        ),
      ),
    );

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "terminal", reason: "invalid_recipient" });
  });

  it("classifies 5xx as retryable server_error", async () => {
    server.use(
      http.post(SEND_URL, () =>
        HttpResponse.json({ name: "internal_server_error" }, { status: 500 }),
      ),
    );

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "retryable", reason: "server_error" });
  });

  it("classifies other 4xx as terminal rejected", async () => {
    server.use(
      http.post(SEND_URL, () => HttpResponse.json({ name: "invalid_api_key" }, { status: 401 })),
    );

    const result = await adapter().send(otpMessage());

    expect(result).toEqual({ kind: "terminal", reason: "rejected" });
  });

  it("sends the idempotency key and the code ONLY inside the request body", async () => {
    let capturedHeaders: Headers | null = null;
    let capturedBody: string | null = null;
    server.use(
      http.post(SEND_URL, async ({ request }) => {
        capturedHeaders = request.headers;
        capturedBody = await request.text();
        return HttpResponse.json({ id: "msg-body" }, { status: 200 });
      }),
    );
    const message = otpMessage({ idempotencyKey: "otp-login/body-check" });

    await adapter().send(message);

    expect(capturedHeaders).not.toBeNull();
    expect(capturedBody).not.toBeNull();
    const headers: Headers = capturedHeaders ?? new Headers();
    expect(headers.get("idempotency-key")).toBe("otp-login/body-check");
    expect(headers.get("authorization")).toBe("Bearer re_test_key");
    expect(capturedBody ?? "").toContain(OTP_CODE);
  });

  it("never exposes the OTP code in any result object across every failure path (INV-09)", async () => {
    const statusResponses = [
      HttpResponse.json({ id: "msg-ok" }, { status: 200 }),
      HttpResponse.json({ name: "invalid_idempotent_request" }, { status: 409 }),
      HttpResponse.json(
        { name: "rate_limit_exceeded" },
        { status: 429, headers: { "retry-after": "1" } },
      ),
      HttpResponse.json(
        { name: "validation_error", message: `code ${OTP_CODE} echoed by provider` },
        { status: 422 },
      ),
      HttpResponse.json({ name: "internal_server_error" }, { status: 500 }),
      HttpResponse.json({ name: "invalid_api_key" }, { status: 401 }),
    ];
    for (const response of statusResponses) {
      server.use(http.post(SEND_URL, () => response.clone(), { once: true }));
      const result = await adapter().send(otpMessage());
      expect(JSON.stringify(result)).not.toContain(OTP_CODE);
    }
  });

  it("never exposes the OTP code on network failure paths (INV-09)", async () => {
    server.use(http.post(SEND_URL, () => HttpResponse.error()));

    const result = await adapter().send(otpMessage());

    expect(result.kind).toBe("retryable");
    expect(JSON.stringify(result)).not.toContain(OTP_CODE);
  });
});
