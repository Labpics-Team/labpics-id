import { Hono } from "hono";
import type { AppVariables } from "../types";

/**
 * Owned admin API surface, mounted at /api/v1.
 * Placeholder route only; real endpoints land with later chapters.
 */
export function v1Routes() {
  const app = new Hono<{ Variables: AppVariables }>().basePath("/api/v1");
  app.get("/ping", (c) => c.json({ ok: true, requestId: c.get("requestId") }));
  return app;
}
