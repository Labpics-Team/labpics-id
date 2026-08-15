import Provider from "oidc-provider";
import type { BoundaryClient } from "./boundary.ts";
import type { ProtocolConfig } from "./config.ts";
import { FailClosedExternalAdapter } from "./fail-closed-adapter.ts";
import type { Logger } from "./lib/logger.ts";

export interface ProtocolAppOptions {
  readonly config: ProtocolConfig;
  readonly boundaryClient: BoundaryClient;
  readonly logger: Logger;
}

/**
 * Creates only the protocol-facing process. Identity, consent and persistence
 * remain behind the authenticated boundary and are wired by later ch03 slices.
 */
export function createProtocolApp({ config, logger }: ProtocolAppOptions): Provider {
  const provider = new Provider(config.issuer, {
    // "external" must never silently degrade to the in-memory quick-start
    // adapter; until platform stores land, stateful operations fail closed.
    ...(config.adapter === "external" ? { adapter: FailClosedExternalAdapter } : {}),
    clients: [],
    jwks: config.jwks === "generated" ? undefined : config.jwks,
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      introspection: { enabled: true },
      revocation: { enabled: true },
    },
    responseTypes: ["code"],
    pkce: {
      methods: ["S256"],
      required: () => true,
    },
    claims: {
      openid: ["sub"],
      profile: ["name", "preferred_username"],
      email: ["email", "email_verified"],
    },
    scopes: ["openid", "profile", "email", "offline_access"],
    interactions: {
      url(_ctx, interaction) {
        return `/interaction/${encodeURIComponent(interaction.uid)}`;
      },
    },
    renderError(ctx, out, error) {
      logger.warn(
        {
          correlationId: ctx.get("x-correlation-id") || undefined,
          error: out.error,
          errorDescription: out.error_description,
          providerError: error,
        },
        "OIDC request rejected",
      );
      ctx.type = "html";
      ctx.body =
        "<!doctype html><meta charset=utf-8><title>Ошибка авторизации</title><h1>Запрос отклонён</h1>";
    },
  });

  // Koa's proxy mode is deliberately disabled. Public issuer and generated
  // protocol URLs come from the canonical configured issuer, never Host or
  // X-Forwarded-* supplied by a caller.
  provider.proxy = false;
  const issuerOrigin = new URL(config.issuer).origin;
  provider.use(async (ctx, next) => {
    const suppliedForwardingHeaders = [
      "forwarded",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-port",
      "x-forwarded-proto",
      "x-real-ip",
      "x-labpics-subject",
      "x-labpics-session",
      "x-labpics-workload",
    ].filter((name) => ctx.get(name) !== "");
    if (suppliedForwardingHeaders.length > 0) {
      ctx.status = 400;
      ctx.type = "application/json";
      ctx.body = {
        error: "untrusted_header",
        error_description: "Caller-supplied forwarding or identity headers are forbidden",
      };
      return;
    }
    // oidc-provider derives ctx.oidc.urlFor(...) URLs from Koa's ctx.href,
    // which reflects the transport Host header. Pin it to the canonical
    // configured issuer so no header can influence endpoint construction.
    Object.defineProperty(ctx.request, "href", {
      configurable: true,
      get: () => `${issuerOrigin}${ctx.request.originalUrl}`,
    });
    ctx.set("cache-control", "no-store");
    ctx.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    await next();
  });

  return provider;
}
