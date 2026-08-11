import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("navigation hint proxy", () => {
  it("allows navigation with a cookie without asserting authentication", () => {
    const request = new NextRequest("https://id.lab.pics/account", {
      headers: { cookie: "labpics_session=untrusted-presence-only" },
    });

    const response = proxy(request);

    expect(response.headers.get("x-labpics-navigation-hint")).toBe("cookie-present-unverified");
    expect(response.headers.get("x-labpics-authenticated")).toBeNull();
  });
});
