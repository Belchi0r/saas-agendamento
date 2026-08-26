import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";

import { runCommand } from "./process.js";

export async function findFreeTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export function mountAsciiWorkspacePath(spikeRoot: string) {
  if (process.platform !== "win32") {
    return { runtimeRoot: spikeRoot, unmount: () => undefined };
  }

  const mappings = execFileSync("subst.exe", [], { encoding: "utf8" });
  const drive = ["Q:", "R:", "S:", "T:", "U:"]
    .find((candidate) => !mappings.toUpperCase().includes(candidate));
  assert.ok(drive, "No free drive letter is available for the Windows harness");

  execFileSync("subst.exe", [drive, spikeRoot], { stdio: "pipe" });
  return {
    runtimeRoot: `${drive}\\`,
    unmount: () => {
      execFileSync("subst.exe", [drive, "/D"], { stdio: "pipe" });
    },
  };
}

export function createEmbeddedPostgres(
  runtimeRoot: string,
  cycle: number,
  port: number,
) {
  const databaseDir = path.resolve(
    runtimeRoot,
    ".tmp",
    `postgres-cycle-${cycle}`,
  );
  const expectedParent = path.resolve(runtimeRoot, ".tmp");
  assert.ok(
    databaseDir.startsWith(`${expectedParent}${path.sep}`),
    "Refusing to use a PostgreSQL data directory outside the spike temp root",
  );

  return {
    databaseDir,
    instance: new EmbeddedPostgres({
      databaseDir,
      port,
      user: "postgres",
      password: "postgres",
      authMethod: "scram-sha-256",
      persistent: false,
      onLog: () => undefined,
      onError: (error) => console.error("[embedded-postgres]", error),
    }),
  };
}

export async function stopEmbeddedPostgres(
  instance: EmbeddedPostgres,
  databaseDir: string,
) {
  const embeddedEntry = import.meta.resolve("embedded-postgres");
  const binaryModule = await import(new URL("./binary.js", embeddedEntry).href) as {
    default: () => Promise<{ pg_ctl: string }>;
  };
  const { pg_ctl: pgCtl } = await binaryModule.default();
  const result = await runCommand(
    pgCtl,
    ["stop", "-D", databaseDir, "-m", "fast", "-w"],
    { cwd: path.dirname(databaseDir) },
  );
  assert.equal(
    result.exitCode,
    0,
    `pg_ctl stop failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );

  // embedded-postgres otherwise invokes taskkill again from its exit hook.
  (instance as unknown as { process?: unknown }).process = undefined;
  await rm(databaseDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
