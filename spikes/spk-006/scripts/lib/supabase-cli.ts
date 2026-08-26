import assert from "node:assert/strict";
import path from "node:path";

import { runCommand, type CommandResult } from "./process.js";

export async function applyMigrationsWithSupabaseCli(
  spikeRoot: string,
  databaseUrl: string,
): Promise<CommandResult> {
  const cliEntry = path.join(
    spikeRoot,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
  const result = await runCommand(
    process.execPath,
    [cliEntry, "migration", "up", "--db-url", databaseUrl, "--include-all"],
    { cwd: spikeRoot },
  );
  assert.equal(
    result.exitCode,
    0,
    `Supabase CLI migration failed.\n${result.stdout}\n${result.stderr}`,
  );
  return {
    ...result,
    command: "supabase migration up --db-url <redacted-db-url> --include-all",
  };
}

