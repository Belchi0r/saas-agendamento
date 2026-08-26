import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function packageVersion(packageName: string): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(
      path.join(spikeRoot, "node_modules", packageName, "package.json"),
      "utf8",
    ),
  ) as { version: string };
  return packageJson.version;
}

export async function testedVersions() {
  return {
    node: process.version,
    v8: process.versions.v8,
    openssl: process.versions.openssl,
    supabaseSsr: await packageVersion("@supabase/ssr"),
    supabaseJs: await packageVersion("@supabase/supabase-js"),
    next: await packageVersion("next"),
    react: await packageVersion("react"),
    reactDom: await packageVersion("react-dom"),
    typescript: await packageVersion("typescript"),
    tsx: await packageVersion("tsx"),
    pnpm: "11.19.0",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await testedVersions(), null, 2));
}

