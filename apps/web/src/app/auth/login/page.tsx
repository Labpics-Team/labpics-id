import type { Metadata } from "next";
import { Button } from "@/components/primitives/button";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Sign in</h1>
        <p className="text-sm text-neutral-600">
          Placeholder login page — real authentication lands with the auth chapter.
        </p>
        <Button asChild className="w-full">
          <a href="/">Back home</a>
        </Button>
      </div>
    </main>
  );
}
