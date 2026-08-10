import { type Logger as PinoLogger, pino } from "pino";
import type { LogLevel } from "../config";

export type Logger = PinoLogger;

export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: { service: "labpics-api" },
  });
}
