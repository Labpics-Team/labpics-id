import { HttpResponse, http } from "msw";

/**
 * MSW handler scaffold for API contract tests. Add a handler per endpoint as
 * endpoints land in later chapters; test files use setupServer from "msw/node".
 */
export const handlers = [
  http.get("http://localhost:3000/health", () =>
    HttpResponse.json({
      status: "ok",
      service: "labpics-api",
      time: new Date().toISOString(),
    }),
  ),
  http.get("http://localhost:3000/api/v1/ping", () => HttpResponse.json({ ok: true })),
];
