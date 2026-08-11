import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App",
};

export default function AppPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="max-w-md text-center text-label-s">
        Protected placeholder. This page is reachable only with a session cookie (see src/proxy.ts).
      </p>
    </main>
  );
}
