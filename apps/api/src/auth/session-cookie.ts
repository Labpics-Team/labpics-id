import type { NodeEnv } from "../config";

export function sessionCookieAttributes(runtime: NodeEnv) {
  return {
    httpOnly: true,
    secure: runtime === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}
