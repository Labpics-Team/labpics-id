import { expect } from "bun:test";
import type { IdentityUseCases } from "@labpics/domain";
import { Email } from "@labpics/domain";

export interface IdentityContractHarness {
  readonly useCases: IdentityUseCases;
  token(kind: "email_verification" | "password_reset"): string;
}

export async function runIdentityUseCaseContract(harness: IdentityContractHarness): Promise<void> {
  const email = Email.from(`contract-${crypto.randomUUID()}@example.com`);
  const registration = await harness.useCases.register({
    email,
    name: "Contract User",
    password: "correct horse battery staple",
  });
  expect(registration.kind).toBe("accepted");
  if (registration.kind !== "accepted") return;

  expect(
    await harness.useCases.verifyEmail({ token: harness.token("email_verification") }),
  ).toMatchObject({ kind: "accepted" });
  const signIn = await harness.useCases.signIn({
    email,
    password: "correct horse battery staple",
  });
  expect(signIn).toMatchObject({ kind: "accepted" });
  expect(await harness.useCases.requestPasswordReset({ email })).toEqual({
    kind: "accepted",
    value: undefined,
  });
  expect(
    await harness.useCases.resetPassword({
      token: harness.token("password_reset"),
      newPassword: "new correct horse battery staple",
    }),
  ).toEqual({ kind: "accepted", value: undefined });
  expect(await harness.useCases.listSessions(registration.value.id)).toMatchObject({
    kind: "accepted",
  });
  if (signIn.kind === "accepted") {
    expect(
      await harness.useCases.revokeSession({
        subjectId: registration.value.id,
        sessionId: signIn.value.id,
      }),
    ).toEqual({ kind: "accepted", value: undefined });
  }
  expect(await harness.useCases.deactivate({ subjectId: registration.value.id })).toMatchObject({
    kind: "accepted",
  });
  expect(await harness.useCases.listSessions(registration.value.id)).toEqual({
    kind: "rejected",
    error: { kind: "subject_deactivated" },
  });
}
