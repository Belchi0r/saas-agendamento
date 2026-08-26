import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe("physical architecture boundaries", () => {
  it("keeps Domain independent from framework and adapters", () => {
    const files = sourceFiles(join(process.cwd(), "src", "domain"));
    const prohibited = [
      "next/",
      "react",
      "@supabase/",
      "drizzle-orm",
      'from "pg"',
      "@/infrastructure",
      "@/persistence",
      "@/delivery",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const dependency of prohibited) {
        expect(source, `${file} imports ${dependency}`).not.toContain(dependency);
      }
    }
  });

  it("does not expose PostgreSQL credentials from the browser Auth module", () => {
    const browserSource = readFileSync(
      join(process.cwd(), "src", "infrastructure", "auth", "browser-client.ts"),
      "utf8",
    );

    expect(browserSource).not.toMatch(/DATABASE_URL|MIGRATION_DATABASE_URL|from "pg"/);
  });

  it("keeps every Client Component outside persistence and Business authority", () => {
    const files = sourceFiles(join(process.cwd(), "src"));
    const clientFiles = files.filter((file) =>
      readFileSync(file, "utf8").startsWith('"use client"'),
    );

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@\/persistence|DATABASE_URL|businessId|business_id/);
    }
  });
});
