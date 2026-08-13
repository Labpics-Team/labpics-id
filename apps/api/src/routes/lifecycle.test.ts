import { describe, expect, it } from "bun:test";
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
});
