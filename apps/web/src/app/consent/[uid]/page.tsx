import { redirect } from "next/navigation";
import { ConsentForm } from "./consent-form";

interface ConsentPageProps {
  params: Promise<{ uid: string }>;
}

export default async function ConsentPage({ params }: ConsentPageProps) {
  const { uid } = await params;

  const protocolIssuer = process.env.PROTOCOL_ISSUER || "https://id.lab.pics";

  let details: unknown;
  try {
    const res = await fetch(`${protocolIssuer}/interaction/${uid}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      redirect("/auth/login?error=interaction_not_found");
    }
    details = await res.json();
  } catch {
    redirect("/auth/login?error=protocol_unreachable");
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--lab-bg-secondary)",
        padding: "var(--lab-space-16)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "var(--lab-shell-auth)" }}>
        <div
          style={{
            borderRadius: "var(--lab-radius-lg)",
            background: "var(--lab-bg-primary)",
            padding: "var(--lab-space-48)",
            boxShadow: "var(--lab-shadow-card)",
          }}
        >
          <div style={{ marginBottom: "var(--lab-space-24)", textAlign: "center" }}>
            <h1
              style={{
                fontSize: "var(--lab-text-h1)",
                fontWeight: 600,
                lineHeight: "var(--lab-text-h1)",
                letterSpacing: "var(--lab-text-h1)",
                color: "var(--lab-label-p)",
              }}
            >
              Запрос авторизации
            </h1>
          </div>

          <ConsentForm uid={uid} details={details} />
        </div>
      </div>
    </div>
  );
}