import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    // Local dev default matches docker-compose.yml; override with DATABASE_URL.
    url:
      process.env.DATABASE_URL ??
      "postgresql://labpics:labpics-dev-password@localhost:54310/labpics",
  },
  strict: true,
  verbose: true,
});
