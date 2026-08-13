import { describe, expect, it } from "bun:test";
import { Email } from "@labpics/domain";
import { lifecycleRoutes, UNIFORM_ACCOUNT_RESPONSE } from "./lifecycle";

describe("anti-enumeration transport contract", () => {
  it.each(["existing@example.com", "missing@example.com", "inactive@example.com"])(
    "returns the identical reset status, envelope, and message for %s",
    async (email) => {
      const response = await lifecycleRoutes().request("/api/v1/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      expect(response.status).toBe(UNIFORM_ACCOUNT_RESPONSE.status);
      expect(await response.json()).toEqual(UNIFORM_ACCOUNT_RESPONSE.body);
    },
  );

  it.each(["existing@example.com", "missing@example.com", "inactive@example.com"])(
    "composed reset use case keeps full response identical for %s",
    async (email) => {
      const calls: string[] = [];
      const app = lifecycleRoutes(
        { consume: async () => ({ kind: "allowed" }) },
        {
          requestPasswordReset: async ({ email: parsed }) => {
            calls.push(parsed.toString());
            return { kind: "accepted", value: undefined };
          },
        },
      );
      const response = await app.request("/api/v1/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "source" },
        body: JSON.stringify({ email }),
      });
      expect({
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.json(),
      }).toEqual({
        status: 202,
        contentType: "application/json",
        body: UNIFORM_ACCOUNT_RESPONSE.body,
      });
      expect(calls).toEqual([Email.from(email).toString()]);
    },
  );
});
