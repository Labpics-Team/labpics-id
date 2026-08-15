import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level: string): Logger {
  return pino({
    level,
    name: "labpics-protocol",
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
      bindings() {
        return {};
      },
    },
    serializers: {
      // Strip secret material before it ever reaches a sink.
      err(err: unknown): Record<string, unknown> {
        if (err instanceof Error) {
          return {
            type: err.constructor.name,
            message: err.message,
            stack: err.stack,
            code: (err as { code?: string }).code,
          };
        }
        return { message: String(err) };
      },
    },
    redact: {
      paths: [
        "credential",
        "secret",
        "client_secret",
        "refresh_token",
        "authorization",
        "boundary[*].secret",
        "payload.secret",
      ],
      censor: "[REDACTED]",
    },
  });
}
