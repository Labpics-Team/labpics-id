"use server";

/*
 * Auth flow seams for the A1/A4 screens.
 *
 * The API's Better Auth surface (apps/api /auth/*) exposes only
 * email+password today — no email-OTP endpoints. These actions are the
 * typed contract seam the ch02 auth chapter will fill: the discriminated
 * unions below ARE the interface the screens are built against, so wiring
 * the real transport later changes no component code.
 *
 * Stub semantics (deterministic, for screen-state exercise only — no data
 * is persisted and no code is actually sent):
 * - requestOtpCode: any syntactically valid e-mail is accepted; the literal
 *   "unknown@lab.pics" simulates the "account not found" error frame.
 * - verifyOtpCode: "000000" simulates an invalid code; anything else passes.
 */

export type RequestOtpResult =
  | { readonly ok: true; readonly maskedEmail: string }
  | { readonly ok: false; readonly error: "account-not-found" | "invalid-email" };

export type VerifyOtpResult =
  | { readonly ok: true; readonly redirectTo: string }
  | { readonly ok: false; readonly error: "invalid-code" | "expired-code" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestOtpCode(email: string): Promise<RequestOtpResult> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "invalid-email" };
  }
  if (normalized === "unknown@lab.pics") {
    return { ok: false, error: "account-not-found" };
  }
  return { ok: true, maskedEmail: normalized };
}

export async function verifyOtpCode(email: string, code: string): Promise<VerifyOtpResult> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized) || code === "000000") {
    return { ok: false, error: "invalid-code" };
  }
  return { ok: true, redirectTo: "/app" };
}
