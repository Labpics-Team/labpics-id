import type { Metadata } from "next";
import { LoginFlow } from "./login-flow";

export const metadata: Metadata = {
  title: "Вход",
};

/** A1 sign-in + A4 OTP (Figma taste-SSOT, docs/design/FIGMA-BASELINE.md). */
export default function LoginPage() {
  return <LoginFlow />;
}
