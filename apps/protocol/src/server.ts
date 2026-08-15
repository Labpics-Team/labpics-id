import { createServer } from "node:http";
import { createBoundaryClient } from "./boundary.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./lib/logger.ts";
import { createProtocolApp } from "./protocol-app.ts";

// loadConfig fail-closes production defaults (memory adapter, generated JWKS,
// devInteractions, missing boundary credentials) before anything listens.
const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);

logger.info({ issuer: config.issuer, nodeVersion: process.version }, "Protocol server starting");

const boundaryClient = createBoundaryClient({
  credentials: config.boundaryCredentials,
  baseUrl: config.apiBaseUrl,
  timeoutMs: config.boundaryTimeoutMs,
  maxRetries: config.boundaryMaxRetries,
  responseLimitBytes: config.responseLimitBytes,
  logger,
});

const protocolApp = createProtocolApp({ config, boundaryClient, logger });
const server = createServer(protocolApp.callback());

server.requestTimeout = config.requestTimeoutMs;

server.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port, issuer: config.issuer },
    "Protocol server listening",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    process.exit(0);
  });
  // Force-exit if in-flight requests block close beyond the request deadline.
  setTimeout(() => process.exit(1), config.requestTimeoutMs + 1_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
