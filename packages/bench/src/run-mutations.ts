import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DEFAULT_LIMITS, ENGINE_VERSION, parseDataText } from "@drift/core";
import { runMutations, summarise, type MutationResult } from "./evaluate.ts";
import { writePage } from "./evaluation-files.ts";
import type { MutationResults } from "./evaluation.ts";
import { cacheFileName, FIXTURES } from "./fixtures.ts";
import { PATHS } from "./paths.ts";

/**
 * `pnpm --filter @drift/bench run mutations [--fixtures]`
 * Runs the labelled mutations on the petstore example (and, with --fixtures, on the downloaded real-world specs),
 * writes docs/evaluation/mutations.json and regenerates docs/EVALUATION.md.
 */
const seeds = [0, 1, 2];
const specs: [string, string][] = [["petstore-v1", `${PATHS.examples}petstore/v1.yaml`]];
if (process.argv.includes("--fixtures")) {
  for (const fixture of FIXTURES) {
    const path = `${PATHS.fixtures}${cacheFileName(fixture)}`;
    if (!existsSync(path)) throw new Error(`${fixture.id} is not downloaded; run fixtures:fetch first`);
    specs.push([fixture.id, path]);
  }
}
const results: MutationResult[] = [];
const skipped: string[] = [];
for (const [name, path] of specs) {
  const parsed = parseDataText(await readFile(path, "utf8"), name, DEFAULT_LIMITS);
  if (!parsed.ok) throw new Error(`${name} does not parse`);
  const run = await runMutations(name, parsed.value as Record<string, unknown>, seeds);
  results.push(...run.results);
  skipped.push(...run.skipped);
  console.log(`${name}: ${String(run.results.length)} mutations`);
}
const output: MutationResults = {
  kind: "drift-mutations/v1",
  engineVersion: ENGINE_VERSION,
  generatedAt: new Date().toISOString(),
  seeds,
  specs: specs.map(([name]) => name),
  summary: summarise(results),
  results,
  skipped,
};
await mkdir(PATHS.evaluation, { recursive: true });
await writeFile(`${PATHS.evaluation}mutations.json`, `${JSON.stringify(output, null, 2)}\n`);
await writePage();
console.log(JSON.stringify(output.summary));
