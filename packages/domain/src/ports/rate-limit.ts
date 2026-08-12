export type IdentityAction =
  | "registration"
  | "verification"
  | "sign_in"
  | "password_reset"
  | "deactivation"
  | "session_management";

export interface RateLimitAttempt {
  readonly action: IdentityAction;
  readonly key: string;
}

export type RateLimitDecision =
  | { readonly kind: "allowed" }
  | { readonly kind: "limited"; readonly retryAt: Date };

export interface RateLimitPort {
  consume(attempt: RateLimitAttempt): Promise<RateLimitDecision>;
}
