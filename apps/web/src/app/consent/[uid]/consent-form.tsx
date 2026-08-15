"use client";

import { useState } from "react";

interface ConsentFormProps {
  uid: string;
  details: {
    clientId: string;
    clientName: string | null;
    clientLogoUri: string | null;
    requestedScopes: string[];
    redirectUri: string;
    subjectId: string | null;
  };
}

const SCOPE_DESCRIPTIONS: Record<string, { label: string; description: string; sensitive: boolean }> = {
  openid: {
    label: "Идентификация",
    description: "Подтвердить вашу личность",
    sensitive: false,
  },
  profile: {
    label: "Профиль",
    description: "Имя и имя пользователя",
    sensitive: false,
  },
  email: {
    label: "Электронная почта",
    description: "Адрес электронной почты",
    sensitive: false,
  },
  offline_access: {
    label: "Офлайн-доступ",
    description: "Долгосрочный доступ без повторного входа",
    sensitive: true,
  },
};

export function ConsentForm({ uid, details }: ConsentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const protocolIssuer = process.env.NEXT_PUBLIC_PROTOCOL_ISSUER || "https://id.lab.pics";

  const handleSubmit = async (decision: "allow" | "deny") => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${protocolIssuer}/interaction/${uid}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: details.subjectId ? { accountId: details.subjectId, remember: true } : undefined,
          consent: {
            reject: decision === "deny",
            scope: decision === "allow" ? details.requestedScopes : undefined,
          },
        }),
        redirect: "manual",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) {
          window.location.href = location;
          return;
        }
      }

      if (!res.ok) {
        throw new Error("Failed to submit consent decision");
      }

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  const hasSensitiveScopes = details.requestedScopes.some(
    (scope) => SCOPE_DESCRIPTIONS[scope]?.sensitive,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lab-space-24)" }}>
      {error && (
        <div
          role="alert"
          style={{
            borderRadius: "var(--lab-radius-md)",
            background: "var(--lab-sentiment-error-bg)",
            padding: "var(--lab-space-12)",
            fontSize: "var(--lab-text-small)",
            lineHeight: "var(--lab-text-small)",
            color: "var(--lab-sentiment-error-text)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lab-space-16)" }}>
        {/* Applicant identity */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--lab-space-16)" }}>
          {details.clientLogoUri && (
            <img
              src={details.clientLogoUri}
              alt=""
              style={{
                height: "var(--lab-size-logo-tile)",
                width: "var(--lab-size-logo-tile)",
                borderRadius: "var(--lab-radius-md)",
                objectFit: "contain",
              }}
            />
          )}
          {!details.clientLogoUri && (
            <div
              style={{
                height: "var(--lab-size-logo-tile)",
                width: "var(--lab-size-logo-tile)",
                borderRadius: "var(--lab-radius-md)",
                background: "var(--lab-bg-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: "var(--lab-text-h3)",
                  fontWeight: 600,
                  color: "var(--lab-accent-blue)",
                }}
              >
                {(details.clientName || details.clientId).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lab-space-4)" }}>
            <p
              style={{
                fontSize: "var(--lab-text-small)",
                lineHeight: "var(--lab-text-small)",
                color: "var(--lab-label-s)",
                margin: 0,
              }}
            >
              Запрашивает доступ
            </p>
            <p
              style={{
                fontSize: "var(--lab-text-h3)",
                fontWeight: 600,
                lineHeight: "var(--lab-text-h3)",
                letterSpacing: "var(--lab-text-h3)",
                color: "var(--lab-label-p)",
                margin: 0,
              }}
            >
              {details.clientName || details.clientId}
            </p>
          </div>
        </div>

        {/* Scope ledger */}
        <div
          style={{
            borderTop: "1px solid var(--lab-border-hairline)",
            paddingTop: "var(--lab-space-16)",
          }}
        >
          <p
            style={{
              marginBottom: "var(--lab-space-12)",
              fontSize: "var(--lab-text-body)",
              fontWeight: 500,
              lineHeight: "var(--lab-text-body)",
              color: "var(--lab-label-p)",
            }}
          >
            Этому приложению будет разрешено:
          </p>
          <ul
            role="list"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--lab-space-8)",
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {details.requestedScopes.map((scope) => {
              const info = SCOPE_DESCRIPTIONS[scope] ?? {
                label: scope,
                description: `Доступ к: ${scope}`,
                sensitive: true,
              };
              return (
                <li
                  key={scope}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "var(--lab-space-12)",
                    borderRadius: "var(--lab-radius-md)",
                    background: "var(--lab-bg-tertiary)",
                    padding: "var(--lab-space-12)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--lab-space-4)" }}>
                    <span
                      style={{
                        fontSize: "var(--lab-text-body)",
                        fontWeight: 500,
                        lineHeight: "var(--lab-text-body)",
                        color: "var(--lab-label-p)",
                      }}
                    >
                      {info.label}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--lab-text-small)",
                        lineHeight: "var(--lab-text-small)",
                        color: "var(--lab-label-s)",
                      }}
                    >
                      {info.description}
                    </span>
                  </div>
                  {info.sensitive && (
                    <span
                      style={{
                        borderRadius: "var(--lab-radius-sm)",
                        background: "var(--lab-sentiment-warning-bg)",
                        padding: "var(--lab-space-4) var(--lab-space-8)",
                        fontSize: "var(--lab-text-label)",
                        lineHeight: "var(--lab-text-label)",
                        color: "var(--lab-sentiment-warning)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Чувствительный
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Warning tier for sensitive scopes */}
      {hasSensitiveScopes && (
        <div
          role="note"
          style={{
            borderRadius: "var(--lab-radius-md)",
            background: "var(--lab-sentiment-warning-bg)",
            padding: "var(--lab-space-16)",
          }}
        >
          <p
            style={{
              fontSize: "var(--lab-text-small)",
              lineHeight: "var(--lab-text-small)",
              color: "var(--lab-sentiment-warning)",
              margin: 0,
            }}
          >
            Запрошены расширенные права доступа. Убедитесь, что вы доверяете этому приложению.
          </p>
        </div>
      )}

      {/* Decision buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lab-space-12)" }}>
        <button
          type="button"
          onClick={() => handleSubmit("allow")}
          disabled={loading}
          style={{
            width: "100%",
            height: "var(--lab-size-control)",
            borderRadius: "var(--lab-radius-md)",
            background: "var(--lab-accent-blue-strong)",
            border: "none",
            fontSize: "var(--lab-text-label)",
            fontWeight: 500,
            lineHeight: "var(--lab-text-label)",
            color: "var(--lab-on-accent)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "background-color var(--lab-motion-instant) var(--lab-ease-out)",
          }}
        >
          {loading ? "Обработка..." : "Разрешить"}
        </button>
        <button
          type="button"
          onClick={() => handleSubmit("deny")}
          disabled={loading}
          style={{
            width: "100%",
            height: "var(--lab-size-control)",
            borderRadius: "var(--lab-radius-md)",
            background: "var(--lab-bg-primary)",
            border: "1px solid var(--lab-border-strong)",
            fontSize: "var(--lab-text-label)",
            fontWeight: 500,
            lineHeight: "var(--lab-text-label)",
            color: "var(--lab-label-p)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "background-color var(--lab-motion-instant) var(--lab-ease-out)",
          }}
        >
          Отклонить
        </button>
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: "var(--lab-text-caption)",
          lineHeight: "var(--lab-text-caption)",
          color: "var(--lab-label-t)",
          margin: 0,
        }}
      >
        Вы будете перенаправлены на {details.redirectUri}
      </p>
    </div>
  );
}