import { describe, expect, it } from "bun:test";
import { sessionCookieAttributes } from "./session-cookie";

describe("first-party session cookie", () => {
  it("is host-only, HttpOnly, Secure, and SameSite strict in production", () => {
    expect(sessionCookieAttributes("production")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  });
});
