import { healthResponseSchema } from "@labpics/contracts";
import { Hono } from "hono";

export function healthRoutes() {
  const app = new Hono();
  app.get("/health", (c) => {
    const body = healthResponseSchema.parse({
      status: "ok",
      service: "labpics-api",
      time: new Date().toISOString(),
    });
    return c.json(body);
  });
  return app;
}
