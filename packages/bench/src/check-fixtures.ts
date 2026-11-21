import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "@drift/core";
import { checkFixture } from "./check.ts";
import { cacheFileName, FIXTURES } from "./fixtures.ts";

/**
 * `pnpm --filter @drift/bench run fixtures:check` — ingests every fixture and diffs it with itself.
 * Writes machine-readable results to results/fixtures.json; exits 1 if any fixture fails.
 * Run `fixtures:fetch` first.
 */
const cacheDir = fileURLToPath(new URL("../fixtures/.cache", import.meta.url));
const resultsDir = fileURLToPath(new URL("../results", import.meta.url));
const reader = {
  size: async (path: string) => (await stat(path)).size,
  readText: (path: string) => readFile(path, "utf8"),
  realpath: (path: string) => realpath(path),
};

const checks = [];
for (const fixture of FIXTURES) {
  const check = await checkFixture(fixture.id, `${cacheDir}/${cacheFileName(fixture)}`, reader);
  console.log(`${check.ok ? "ok  " : "FAIL"} ${JSON.stringify(check)}`);
  checks.push(check);
}
await mkdir(resultsDir, { recursive: true });
const results = {
  kind: "drift-fixture-check/v1",
  engineVersion: ENGINE_VERSION,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  generatedAt: new Date().toISOString(),
  fixtures: checks,
};
await writeFile(`${resultsDir}/fixtures.json`, `${JSON.stringify(results, null, 2)}\n`);
process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
