import Provider from "oidc-provider";
import { BoundaryAdapter } from "./boundary-adapter.ts";
import type { BoundaryClient } from "./boundary.ts";
import type { ProtocolConfig } from "./config.ts";
import type { Logger } from "./lib/logger.ts";

export interface ProtocolAppOptions {
  readonly config: ProtocolConfig;
  readonly boundaryClient: BoundaryClient;
  readonly logger: Logger;
}

/**
 * Creates the protocol-facing process with durable boundary-backed storage.
 * Identity, consent and persistence are wired through the authenticated
 * boundary to the platform API, which owns the SSOT for all provider state.
 */
export function createProtocolApp({ config, boundaryClient, logger }: ProtocolAppOptions): Provider {
  const boundaryAdapter = new BoundaryAdapter(boundaryClient);

  const provider = new Provider(config.issuer, {
    // "external" delegates to the boundary adapter; memory is development-only
    // and bypasses the boundary entirely (config already rejects it in production).
    ...(config.adapter === "external" ? { adapter: BoundaryAdapterFactory(boundaryAdapter) } : {}),
    clients: [],
    jwks: config.jwks === "generated" ? undefined : config.jwks,
    cookies: {
      keys: config.cookieKeys ? [...config.cookieKeys] : undefined,
    },
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
        return `/consent/${encodeURIComponent(interaction.uid)}`;
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

  // Custom interaction routes for the consent UI (ch03-authorize-consent).
  // The Next.js app at /interaction/[uid] fetches details and POSTs the decision here.
  provider.use(async (ctx, next) => {
    if (ctx.method === "GET" && ctx.path.startsWith("/interaction/")) {
      const uid = ctx.path.split("/")[2];
      if (!uid) return next();
      try {
        const details = await provider.interactionDetails(ctx.req, ctx.res);
        const clientId = String(details.params.client_id);
        const clientInfo = await boundaryClient.request({
          version: "1",
          correlationId: crypto.randomUUID(),
          operation: "client.get",
          payload: { clientId },
        });
        const clientRecord = clientInfo as { clientName?: string; logoUri?: string } | null;
        const consentInfo = details.session?.accountId
          ? await boundaryClient.request({
              version: "1",
              correlationId: crypto.randomUUID(),
              operation: "consent.get",
              payload: { subjectId: details.session.accountId, clientId },
            })
          : null;
        const consentRecord = consentInfo as { scopes?: string[] } | null;
        const scopeParam = details.params.scope;
        const requestedScopes = details.prompt?.details?.scopes
          ? (details.prompt.details.scopes as string[])
          : typeof scopeParam === "string"
            ? scopeParam.split(" ")
            : [];
        ctx.type = "application/json";
        ctx.body = {
          uid: details.uid,
          clientId,
          clientName: clientRecord?.clientName || null,
          clientLogoUri: clientRecord?.logoUri || null,
          requestedScopes,
          redirectUri: String(details.params.redirect_uri),
          nonce: details.params.nonce ? String(details.params.nonce) : null,
          state: details.params.state ? String(details.params.state) : null,
          subjectId: details.session?.accountId || null,
          sessionId: details.uid,
          existingConsent: consentRecord?.scopes || null,
        };
      } catch (_error) {
        ctx.status = 404;
        ctx.body = { error: "interaction_not_found" };
      }
      return;
    }
    if (ctx.method === "POST" && ctx.path.endsWith("/finish")) {
      const uid = ctx.path.split("/")[2];
      if (!uid) return next();
      try {
        // Read raw body and parse JSON (Koa doesn't have built-in body parser)
        const chunks: Uint8Array[] = [];
        for await (const chunk of ctx.req as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const body = JSON.parse(rawBody) as {
          consent?: { reject?: boolean; scope?: string[] };
          login?: { accountId: string; remember?: boolean };
        };
        const { consent, login } = body;
        const result: {
          login?: { accountId: string; remember: boolean };
          consent?: { reject: boolean; scope?: string[] };
        } = {};
        if (login) {
          result.login = { accountId: login.accountId, remember: login.remember ?? false };
        }
        if (consent) {
          result.consent = { reject: consent.reject === true };
          if (!result.consent.reject && consent.scope) {
            result.consent.scope = consent.scope;
          }
        }
        // Persist consent via boundary if approved
        if (result.login?.accountId && result.consent && !result.consent.reject && result.consent.scope) {
          const details = await provider.interactionDetails(ctx.req, ctx.res);
          const clientId = String(details.params.client_id);
          await boundaryClient.request({
            version: "1",
            correlationId: crypto.randomUUID(),
            operation: "consent.upsert",
            payload: {
              subjectId: result.login.accountId,
              clientId,
              scopes: result.consent.scope,
            },
          });
        }
        await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: false });
      } catch (error) {
        ctx.status = 400;
        ctx.body = { error: "interaction_failed" };
      }
      return;
    }
    await next();
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

/**
 * oidc-provider expects a constructor (class) for its adapter option.
 * This factory wraps the boundary adapter instance so that oidc-provider
 * can instantiate model-specific adapters while they all delegate to the
 * same boundary client.
 */
function BoundaryAdapterFactory(boundaryAdapter: BoundaryAdapter) {
  return class BoundaryModelAdapter {
    readonly model: string;

    constructor(model: string) {
      this.model = model;
    }

    async upsert(id: string, payload: Record<string, unknown>): Promise<void> {
      return boundaryAdapter.upsert(this.model, id, payload);
    }

    async find(id: string): Promise<Record<string, unknown> | undefined> {
      return boundaryAdapter.find(this.model, id);
    }

    async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
      return boundaryAdapter.findByUserCode(this.model, userCode);
    }

    async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
      return boundaryAdapter.findByUid(this.model, uid);
    }

    async consume(id: string): Promise<void> {
      return boundaryAdapter.consume(this.model, id);
    }

    async destroy(id: string): Promise<void> {
      return boundaryAdapter.destroy(this.model, id);
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      return boundaryAdapter.revokeByGrantId(grantId);
    }
  };
}