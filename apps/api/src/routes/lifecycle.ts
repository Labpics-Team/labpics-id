import type { Email, RateLimitPort } from "@labpics/domain";
import { verificationResendBudget } from "@labpics/domain";
import { Hono } from "hono";

export const UNIFORM_ACCOUNT_RESPONSE = {
  status: 202,
  body: { ok: true, message: "If the account can continue, instructions will be sent." },
} as const;

export interface LifecycleUseCases {
  requestPasswordReset(command: { readonly email: Email }): Promise<unknown>;
}

export function lifecycleRoutes(limiter?: RateLimitPort, useCases?: LifecycleUseCases) {
  return new Hono()
    .post("/api/v1/password-reset/request", async (c) => {
      const body = await c.req.json<{ email?: string }>();
      await limiter?.consume({
        action: "password_reset",
        key: body.email ?? "missing",
        source: c.req.header("x-forwarded-for") ?? "unknown",
      });
      if (useCases !== undefined && body.email !== undefined) {
        const { Email } = await import("@labpics/domain");
        await useCases.requestPasswordReset({ email: Email.from(body.email) });
      }
      return c.json(UNIFORM_ACCOUNT_RESPONSE.body, UNIFORM_ACCOUNT_RESPONSE.status);
    })
    .post("/api/v1/verification/resend", async (c) => {
      const body = await c.req.json<{ email?: string }>();
      if (limiter !== undefined) {
        await verificationResendBudget(
          { rateLimit: limiter },
          body.email ?? "missing",
          c.req.header("x-forwarded-for") ?? "unknown",
        );
      }
      return c.json(UNIFORM_ACCOUNT_RESPONSE.body, UNIFORM_ACCOUNT_RESPONSE.status);
    });
}
