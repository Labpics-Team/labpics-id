/**
 * Entrypoint: refuses Bun and pre-22.11 Node before importing anything that
 * could partially work on an unsupported runtime (ch03 invariant).
 */
import { assertSupportedRuntime } from "./runtime-guard.ts";

assertSupportedRuntime({
  bunPresent: "Bun" in globalThis,
  nodeVersion: process.versions.node,
});

await import("./server.ts");
