import type { Metadata } from "next";
import { Button } from "@/components/primitives/button";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-lab-24">
      <div className="flex w-full max-w-auth flex-col gap-lab-24 rounded-lg border border-hairline bg-surface-2 p-lab-32">
        <h1 className="text-h2 text-label-p">Sign in</h1>
        <p className="text-small text-label-s">
          Placeholder login page — real authentication lands with the auth chapter.
        </p>
        <Button asChild className="w-full">
          <a href="/">Back home</a>
        </Button>
      </div>
    </main>
  );
}
