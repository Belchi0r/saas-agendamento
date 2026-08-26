import { readFile } from "node:fs/promises";
import path from "node:path";

const spikeRoot = path.resolve(import.meta.dirname, "..");
const polyfillPackage = JSON.parse(await readFile(
  path.join(spikeRoot, "node_modules", "@js-temporal", "polyfill", "package.json"),
  "utf8",
)) as { version: string };

console.log(JSON.stringify({
  node: process.version,
  v8: process.versions.v8,
  icu: process.versions.icu,
  cldr: process.versions.cldr,
  tzdata: process.versions.tz,
  temporalDefault: typeof (globalThis as Record<string, unknown>).Temporal,
  polyfill: polyfillPackage.version,
}, null, 2));
