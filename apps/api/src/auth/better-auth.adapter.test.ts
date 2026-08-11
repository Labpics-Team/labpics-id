import { describe, expect, it } from "bun:test";
import { ConfigError } from "../config";
import { createBetterAuthPort } from "./better-auth.adapter";

describe("Better Auth adapter safety", () => {
  it("rejects the memory adapter in production before serving a request", () => {
    expect(() =>
      createBetterAuthPort({
        runtime: "production",
        persistence: "memory",
        secret: "a-production-secret-with-more-than-32-characters",
        baseUrl: "https://id.lab.pics",
        trustedOrigins: ["https://id.lab.pics"],
      }),
    ).toThrow(ConfigError);
  });
});
