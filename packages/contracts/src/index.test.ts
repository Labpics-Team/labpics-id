import { describe, expect, it } from "bun:test";
import { errorEnvelopeSchema, healthResponseSchema, paginationQuerySchema } from "./index";

describe("@labpics/contracts", () => {
  it("parses a health response", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      service: "labpics-api",
      time: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid health response", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "degraded",
      service: "",
      time: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });

  it("shapes the error envelope", () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: "internal_error", message: "boom" } }).success,
    ).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ error: { code: "", message: "" } }).success).toBe(false);
  });

  it("applies pagination defaults and caps", () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    // Zod validates rather than clamps: an out-of-range pageSize is rejected.
    const capped = paginationQuerySchema.safeParse({ pageSize: 1000 });
    expect(capped.success).toBe(false);
    const atCap = paginationQuerySchema.parse({ pageSize: 100 });
    expect(atCap.pageSize).toBe(100);
  });
});
