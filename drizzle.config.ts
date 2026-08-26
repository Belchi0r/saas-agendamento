import { defineConfig } from "drizzle-kit";

const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL is required only when generating Drizzle candidate SQL.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/persistence/database/schema/index.ts",
  out: "./drizzle-candidate",
  schemaFilter: ["app_private"],
  dbCredentials: {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
});
