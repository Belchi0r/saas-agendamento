import { readFileSync } from "node:fs";

const readPackageVersion = (relativePath: string) => {
  const packageJson = JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as { version: string };
  return packageJson.version;
};

console.log({
  node: process.version,
  pg: readPackageVersion("../node_modules/pg/package.json"),
  embeddedPostgres: readPackageVersion(
    "../node_modules/embedded-postgres/package.json",
  ),
  supabaseCli: readPackageVersion("../node_modules/supabase/package.json"),
});

