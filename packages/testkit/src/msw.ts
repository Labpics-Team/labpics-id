import { HttpResponse, http } from "msw";

// msw is a dependency of the testkit only; consumer test files import these
// re-exports instead of depending on msw directly.
export { delay, HttpResponse, http } from "msw";
export { setupServer } from "msw/node";

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
