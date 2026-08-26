import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("SPK-002 static migration safety", () => {
  it("restricts Drizzle Kit to app_private", async () => {
    const config = await readFile(path.join(root, "drizzle.config.ts"), "utf8");
    expect(config).toMatch(/schemaFilter:\s*\["app_private"\]/);
  });

  it("does not target auth or storage from the final migration", async () => {
    const migration = await readFile(
      path.join(
        root,
        "supabase",
        "migrations",
        "20260822190000_spk002_app_private_lab.sql",
      ),
      "utf8",
    );
    const withoutComments = migration.replace(/^\s*--.*$/gm, "");
    expect(withoutComments).not.toMatch(/\b(?:auth|storage)\s*\./i);
  });

  it("does not define drizzle-kit push as an application script", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(Object.values(packageJson.scripts).join("\n")).not.toContain(
      "drizzle-kit push",
    );
  });
});
