import type { DeliveryResult, EmailDeliveryPort, OtpEmailMessage } from "@labpics/domain";

/**
 * Resend adapter for EmailDeliveryPort.
 *
 * The Resend HTTP API is called with plain fetch — no SDK dependency, matching
 * the thin-adapter pattern of better-auth.adapter. The Idempotency-Key header
 * makes retries safe: Resend replays the original response (same email id) for
 * a repeated key+payload within 24h, and rejects the same key with a different
 * payload as `invalid_idempotent_request` (409).
 *
 * INV-09: the OTP code appears ONLY in the outgoing request body. Results and
 * errors produced here carry typed reasons without free-text from the message,
 * so the code can never leak through logs or error envelopes.
 */
export interface ResendEmailDeliveryConfig {
  /** Resolved per send so key rotation needs no process restart. */
  readonly apiKeyRef: () => Promise<string> | string;
  /** Verified sender, e.g. "Labpics ID <id@lab.pics>". */
  readonly from: string;
  /** Override for tests/sandboxes; defaults to the public Resend API. */
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** Network budget per attempt; elapsed budget classifies as retryable timeout. */
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.resend.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export function createResendEmailDelivery(config: ResendEmailDeliveryConfig): EmailDeliveryPort {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async send(message: OtpEmailMessage): Promise<DeliveryResult> {
      const apiKey = await config.apiKeyRef();
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify(renderOtpEmail(config.from, message)),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return classifyNetworkFailure(error);
      }
      return classifyResponse(response);
    },
  };
}

/** The OTP code is rendered here and nowhere else (INV-09). */
function renderOtpEmail(from: string, message: OtpEmailMessage): Readonly<Record<string, unknown>> {
  return {
    from,
    to: [message.to.value],
    subject: "Labpics ID — код входа",
    text: `Ваш код входа: ${message.code}\nКод действует до ${message.expiresAt.toISOString()}.\nЕсли вы не запрашивали вход, проигнорируйте это письмо.`,
  };
}

function classifyNetworkFailure(error: unknown): DeliveryResult {
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { kind: "retryable", reason: "timeout" };
  }
  return { kind: "retryable", reason: "server_error" };
}

async function classifyResponse(response: Response): Promise<DeliveryResult> {
  if (response.ok) {
    const body = await parseJson(response);
    const id = typeof body?.id === "string" ? body.id : null;
    if (id === null) {
      // 2xx without an id violates the provider contract; treat as retryable
      // so the caller's idempotency key resolves the truth on the next attempt.
      return { kind: "retryable", reason: "server_error" };
    }
    // Resend replays the original response byte-for-byte, without a replay
    // marker, so a positive duplicate signal is unavailable here. Callers
    // rely on the stable providerMessageId instead.
    return { kind: "delivered", providerMessageId: id, duplicate: false };
  }
  if (response.status === 409) {
    const body = await parseJson(response);
    if (body?.name === "concurrent_idempotent_requests") {
      // A request with this key is still in flight; the replay will settle it.
      return { kind: "retryable", reason: "server_error" };
    }
    return { kind: "terminal", reason: "payload_mismatch" };
  }
  if (response.status === 429) {
    return { kind: "retryable", reason: "rate_limited", ...retryAtFrom(response) };
  }
  if (response.status >= 500) {
    return { kind: "retryable", reason: "server_error" };
  }
  if (response.status === 422) {
    return { kind: "terminal", reason: "invalid_recipient" };
  }
  return { kind: "terminal", reason: "rejected" };
}

function retryAtFrom(response: Response): { retryAt?: Date } {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter === null) {
    return {};
  }
  const seconds = Number.parseInt(retryAfter, 10);
  if (Number.isNaN(seconds) || seconds < 0) {
    return {};
  }
  return { retryAt: new Date(Date.now() + seconds * 1000) };
}

async function parseJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
