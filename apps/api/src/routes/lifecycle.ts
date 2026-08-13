import { Hono } from "hono";

export const UNIFORM_ACCOUNT_RESPONSE = {
  status: 202,
  body: { ok: true, message: "If the account can continue, instructions will be sent." },
} as const;

export function lifecycleRoutes() {
  return new Hono()
    .post("/api/v1/password-reset/request", (c) =>
      c.json(UNIFORM_ACCOUNT_RESPONSE.body, UNIFORM_ACCOUNT_RESPONSE.status),
    )
    .post("/api/v1/verification/resend", (c) =>
      c.json(UNIFORM_ACCOUNT_RESPONSE.body, UNIFORM_ACCOUNT_RESPONSE.status),
    );
}
