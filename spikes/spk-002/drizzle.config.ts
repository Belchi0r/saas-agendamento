import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle-candidate",
  schemaFilter: ["app_private"],
  strict: true,
  verbose: true,
});
