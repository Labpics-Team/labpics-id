/**
 * Runtime guard: refuses Bun and pre-22.11 Node before anything that could
 * partially work on an unsupported runtime (ch03 invariant).
 */
export function assertSupportedRuntime(runtime: {
  readonly bunPresent: boolean;
  readonly nodeVersion: string;
}): void {
  if (runtime.bunPresent) {
    throw new Error("Protocol app requires Node.js runtime; Bun is not supported");
  }
  const [major = 0, minor = 0] = runtime.nodeVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(major) || major < 22 || (major === 22 && minor < 11)) {
    throw new Error(`Protocol app requires Node.js >=22.11 LTS, found ${runtime.nodeVersion}`);
  }
}
