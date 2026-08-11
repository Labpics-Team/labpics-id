/*
 * Next.js client instrumentation — runs before the app hydrates, which is
 * where react-scan must initialize to observe the initial render.
 *
 * React dev tooling gate (DESIGN.md §6): react-scan runs ONLY in development.
 * NODE_ENV is a build-time constant, so the import and the react-scan bundle
 * are dead-code-eliminated from production output. Rubric check G1 enforces
 * the gate.
 */

if (process.env.NODE_ENV === "development") {
  import("react-scan")
    .then(({ scan }) => {
      scan({ enabled: true });
    })
    .catch(() => {
      // Dev-only aid: never break the app if the tool fails to load.
    });
}
