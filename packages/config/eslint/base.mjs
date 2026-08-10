/**
 * Optional shared ESLint flat-config preset.
 *
 * Biome is the canonical linter for this repository (see the root `biome.json`);
 * this preset exists for tooling that requires ESLint. It is intentionally NOT
 * part of the required `bun run lint` gate.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.git/**",
      "**/bun.lock",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
);
