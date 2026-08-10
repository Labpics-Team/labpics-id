import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next auto-transpiles local workspace packages; this only lists the ones
  // that ship TypeScript source (no pre-built dist).
  transpilePackages: ["@labpics/contracts", "@labpics/ui"],
};

export default nextConfig;
