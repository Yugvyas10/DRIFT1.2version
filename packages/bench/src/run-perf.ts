import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "./evaluation-files.ts";
import { cacheFileName, FIXTURES } from "./fixtures.ts";
import { PATHS } from "./paths.ts";
import { cacheRun, corpusRuns, fixtureRun, header, ingestFile, PERF_CONFIG, type PerfResults } from "./perf.ts";

/**
 * `pnpm --filter @drift/bench run perf [--sizes 1000,10000] [--no-fixtures]`
 * Measures the corpus benchmark, a cached re-run and the real-world fixtures (fetch them first with
 * fixtures:fetch), writes results/perf.json and docs/evaluation/perf.json, and regenerates docs/EVALUATION.md.
 * A run with non-default sizes or without fixtures is written to results/ only, so the committed page always
 * describes a complete run.
 */
const args = process.argv.slice(2);
const sizesArg = args.indexOf("--sizes");
const sizes = sizesArg === -1 ? [...PERF_CONFIG.corpusSizes] : (args[sizesArg + 1] ?? "").split(",").map(Number);
const withFixtures = !args.includes("--no-fixtures");
const partial = sizesArg !== -1 || !withFixtures;

const dir = await mkdtemp(join(tmpdir(), "drift-perf-"));
try {
  const base = await ingestFile(`${PATHS.examples}petstore/v1.yaml`);
  const head = await ingestFile(`${PATHS.examples}petstore/v2-breaking.yaml`);
  console.log(`corpus sizes: ${sizes.join(", ")}`);
  const runs = await corpusRuns(base, head, sizes, dir);
  for (const run of runs)
    console.log(`  ${String(run.lines)} lines: ${String(run.ms)} ms, peak RSS ${String(run.peakRssMiB)} MiB`);
  const cache = await cacheRun(base, head, 100_000, dir);
  console.log(`cache: cold ${String(cache.cold.ms)} ms, warm ${String(cache.warm.ms)} ms`);

  const results: PerfResults = {
    ...header(),
    corpus: { spec: "examples/petstore/v1.yaml", head: "examples/petstore/v2-breaking.yaml", runs },
    cache,
    fixtures: [],
  };
  if (!withFixtures) results.fixturesSkipped = "run with --no-fixtures";
  else {
    const missing = FIXTURES.filter((fixture) => !existsSync(`${PATHS.fixtures}${cacheFileName(fixture)}`));
    if (missing.length > 0) {
      results.fixturesSkipped = `not downloaded (${missing.map((f) => f.id).join(", ")}); run fixtures:fetch`;
    } else {
      for (const fixture of FIXTURES) {
        const run = await fixtureRun(fixture.id, `${PATHS.fixtures}${cacheFileName(fixture)}`);
        console.log(
          `  ${fixture.id}: ingest ${String(run.ingest.ms)} ms, self-compare ${String(run.selfCompare.ms)} ms, mutated ${String(run.mutatedCompare.ms)} ms`
        );
        results.fixtures.push(run);
      }
    }
  }
  const text = `${JSON.stringify(results, null, 2)}\n`;
  await mkdir(PATHS.results, { recursive: true });
  await writeFile(`${PATHS.results}perf.json`, text);
  if (partial || results.fixturesSkipped !== undefined) {
    console.log("partial run: written to packages/bench/results/perf.json only");
  } else {
    await mkdir(PATHS.evaluation, { recursive: true });
    await writeFile(`${PATHS.evaluation}perf.json`, text);
    await writePage();
    console.log("wrote docs/evaluation/perf.json and docs/EVALUATION.md");
  }
  process.exitCode = runs.every((run) => run.withinCeiling) ? 0 : 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
