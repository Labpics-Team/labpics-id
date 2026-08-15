import { randomBytes, randomUUID } from "node:crypto";
import { signBoundaryPayload } from "@labpics/contracts/boundary-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface BoundaryCredential {
  id: string;
  secret: string;
  operations: string[];
}

async function sendBoundaryRequest(
  operation: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const apiUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
  const raw = process.env.PROTOCOL_BOUNDARY_CREDENTIALS;

  if (!raw) {
    throw new Error("PROTOCOL_BOUNDARY_CREDENTIALS not configured");
  }

  const credentials = JSON.parse(raw) as BoundaryCredential[];
  const credential = credentials[0];
  if (!credential) {
    throw new Error("No boundary credential available");
  }

  if (!credential.operations.includes(operation)) {
    throw new Error(`Credential not authorized for ${operation}`);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(24).toString("base64url");
  const correlationId = randomUUID();

  const requestBody = {
    version: "1" as const,
    correlationId,
    operation,
    payload,
  };
  const body = new TextEncoder().encode(JSON.stringify(requestBody));
  const signature = signBoundaryPayload(credential.secret, timestamp, nonce, body);

  const response = await fetch(new URL("/internal/protocol/v1", apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `LabpicsBoundary ${credential.id}:${signature}`,
      "x-labpics-boundary-version": "1",
      "x-labpics-timestamp": timestamp,
      "x-labpics-nonce": nonce,
      "x-correlation-id": correlationId,
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Boundary call ${operation} failed: ${response.status} ${errorBody}`);
  }

  const result = (await response.json()) as {
    ok: boolean;
    result?: unknown;
    error?: { code: string; message: string };
  };

  if (!result.ok) {
    throw new Error(`Boundary ${operation} error: ${result.error?.code} ${result.error?.message}`);
  }

  return result.result;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const formData = await request.formData();
  const decision = formData.get("decision");
  const remember = formData.get("remember") === "true";

  if (decision !== "allow" && decision !== "deny") {
    return NextResponse.json(
      { error: "invalid_decision", message: "Decision must be 'allow' or 'deny'" },
      { status: 400 },
    );
  }

  try {
    // Fetch current interaction details to get client/scopes
    const details = (await sendBoundaryRequest("interaction.details", { uid })) as {
      clientId: string;
      requestedScopes: string[];
      subjectId: string | null;
      redirectUri: string;
    } | null;

    if (!details) {
      return NextResponse.json(
        { error: "interaction_not_found", message: "Interaction session expired or not found" },
        { status: 404 },
      );
    }

    const consent = {
      reject: decision === "deny",
      scope: decision === "allow" ? details.requestedScopes : undefined,
    };

    const result = {
      login: {
        accountId: details.subjectId ?? "",
        remember,
      },
      consent,
    };

    // Finish the interaction through the boundary
    await sendBoundaryRequest("interaction.finished", {
      uid,
      result,
      mergeWithLastSubmission: false,
    });

    // If allowed and remember is set, persist consent
    if (decision === "allow" && remember && details.subjectId) {
      await sendBoundaryRequest("consent.upsert", {
        subjectId: details.subjectId,
        clientId: details.clientId,
        scopes: details.requestedScopes,
      });
    }

    // Redirect back to the OIDC flow
    // The protocol process will pick up the finished interaction
    // and issue the authorization code or error.
    const protocolUrl = process.env.PROTOCOL_BASE_URL ?? "https://id.lab.pics";
    const redirectUrl = new URL(`/interaction/${uid}/complete`, protocolUrl);
    redirectUrl.searchParams.set("decision", decision);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "decision_failed", message }, { status: 500 });
  }
}
