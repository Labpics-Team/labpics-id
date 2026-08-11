import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { DevTooling } from "@/components/dev-tooling";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3001"),
  title: { default: "Labpics ID", template: "%s · Labpics ID" },
  description: "Identity and access management for the Labpics platform.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-surface font-sans text-label-p antialiased">
        <DevTooling />
        {children}
      </body>
    </html>
  );
}
