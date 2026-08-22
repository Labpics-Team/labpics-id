export type IdentityAction =
  | "registration"
  | "verification"
  | "verification_resend"
  | "verification_consume"
  | "sign_in"
  | "email_otp_request"
  | "email_otp_redeem"
  | "password_reset"
  | "password_reset_consume"
  | "bootstrap_claim"
  | "deactivation"
  | "session_management";

export interface RateLimitAttempt {
  readonly action: IdentityAction;
  readonly key: string;
  readonly source?: string;
}

export type RateLimitDecision =
  | { readonly kind: "allowed" }
  | { readonly kind: "limited"; readonly retryAt: Date };

export interface RateLimitPort {
  consume(attempt: RateLimitAttempt): Promise<RateLimitDecision>;
}
