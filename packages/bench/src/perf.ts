import { createReadStream } from "node:fs";
import { readFile, realpath, rm, stat } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  compare,
  DEFAULT_LIMITS,
  ENGINE_VERSION,
  ingestSpec,
  parseDataText,
  readJsonl,
  type IngestedSpec,
  type SpecReader,
  type StageCache,
} from "@drift/core";
import { writeCorpus } from "./corpus.ts";
import { measure, type Measurement } from "./measure.ts";
import { mutate } from "./mutations.ts";
import { ingestText } from "./evaluate.ts";

/** Fixed in M3 (PLAN §6 M8): the corpus benchmark must stay under this peak resident set size. */
export const PERF_CONFIG = {
  corpusSizes: [1_000, 10_000, 100_000, 1_000_000],
  memoryCeilingMiB: 512,
  sampleIntervalMs: 25,
} as const;

export interface CorpusRun extends Measurement {
  lines: number;
  fileMiB: number;
  linesPerSecond: number;
  kept: number;
  withinCeiling: boolean;
}

export interface FixtureRun {
  id: string;
  operations: number;
  ingest: Measurement;
  selfCompare: Measurement & { changes: number };
  mutatedCompare: Measurement & { changes: number; breaking: number; mutation: string };
}

export interface PerfResults {
  kind: "drift-perf/v1";
  engineVersion: string;
  environment: { node: string; platform: string; cpu: string; cores: number; memoryGiB: number };
  generatedAt: string;
  config: { corpusSizes: number[]; memoryCeilingMiB: number; sampleIntervalMs: number };
  corpus: { spec: string; head: string; runs: CorpusRun[] };
  cache: { cold: Measurement; warm: Measurement; lines: number };
  fixtures: FixtureRun[];
  fixturesSkipped?: string;
}

export function environment(): PerfResults["environment"] {
  const cpu = cpus();
  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpu[0]?.model.trim() ?? "unknown",
    cores: cpu.length,
    memoryGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  };
}

const fsReader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};

export async function ingestFile(path: string): Promise<IngestedSpec> {
  const result = await ingestSpec(path, { reader: fsReader });
  if (!result.spec) throw new Error(`${path} does not ingest`);
  return result.spec;
}

function memoryCache(): StageCache {
  const store = new Map<string, string>();
  return {
    get: (hash) => Promise.resolve(store.get(hash)),
    put: (hash, value) => {
      store.set(hash, value);
      return Promise.resolve();
    },
  };
}

function traffic(path: string) {
  return {
    kind: "jsonl" as const,
    hash: path,
    open: () => readJsonl(createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity })),
  };
}

/** Streams a generated corpus of each size through the whole pipeline (v1 → v2-breaking of the petstore example). */
export async function corpusRuns(base: IngestedSpec, head: IngestedSpec, sizes: readonly number[], dir: string) {
  const runs: CorpusRun[] = [];
  for (const size of sizes) {
    const file = join(dir, `corpus-${String(size)}.jsonl`);
    const written = await writeCorpus(base.ir, size, file);
    const { result, measurement } = await measure(
      () => compare({ base, head, asOf: "2026-01-01", traffic: traffic(file) }),
      PERF_CONFIG.sampleIntervalMs
    );
    await rm(file);
    runs.push({
      ...measurement,
      lines: written.lines,
      fileMiB: Math.round((written.bytes / 1024 ** 2) * 10) / 10,
      linesPerSecond: Math.round(written.lines / Math.max(measurement.ms / 1000, 0.001)),
      kept: result.corpus.recorded.sampled,
      withinCeiling: measurement.peakRssMiB <= PERF_CONFIG.memoryCeilingMiB,
    });
  }
  return runs;
}

/** The same comparison twice with a cache: the second run reuses every stage whose inputs did not change. */
export async function cacheRun(base: IngestedSpec, head: IngestedSpec, lines: number, dir: string) {
  const file = join(dir, "corpus-cache.jsonl");
  await writeCorpus(base.ir, lines, file);
  const cache = memoryCache();
  const run = () => compare({ base, head, asOf: "2026-01-01", traffic: traffic(file), cache });
  const cold = (await measure(run, PERF_CONFIG.sampleIntervalMs)).measurement;
  const warm = await measure(run, PERF_CONFIG.sampleIntervalMs);
  await rm(file);
  if (!warm.result.stages.slice(2).every((stage) => stage.cached))
    throw new Error("the warm run did not hit the cache");
  return { cold, warm: warm.measurement, lines };
}

/** Ingest, self-compare and a mutated compare of one real-world fixture. */
export async function fixtureRun(id: string, path: string): Promise<FixtureRun> {
  const ingest = await measure(() => ingestFile(path), PERF_CONFIG.sampleIntervalMs);
  const spec = ingest.result;
  const self = await measure(
    () => compare({ base: spec, head: spec, asOf: "2026-01-01" }),
    PERF_CONFIG.sampleIntervalMs
  );
  const parsed = parseDataText(await readFile(path, "utf8"), id, DEFAULT_LIMITS);
  if (!parsed.ok) throw new Error(`${id} does not parse`);
  const mutation = mutate(parsed.value as never, "request-required-field-added", 0);
  if (!mutation) throw new Error(`${id}: no place for the mutation`);
  const head = await ingestText(JSON.stringify(mutation.document), `${id}-mutated.json`);
  const mutated = await measure(() => compare({ base: spec, head, asOf: "2026-01-01" }), PERF_CONFIG.sampleIntervalMs);
  return {
    id,
    operations: Object.keys(spec.ir.operations).length,
    ingest: ingest.measurement,
    selfCompare: { ...self.measurement, changes: self.result.changes.length },
    mutatedCompare: {
      ...mutated.measurement,
      changes: mutated.result.changes.length,
      breaking: mutated.result.summary.breaking,
      mutation: mutation.description,
    },
  };
}

export function header(): Pick<PerfResults, "kind" | "engineVersion" | "environment" | "generatedAt" | "config"> {
  return {
    kind: "drift-perf/v1",
    engineVersion: ENGINE_VERSION,
    environment: environment(),
    generatedAt: new Date().toISOString(),
    config: {
      corpusSizes: [...PERF_CONFIG.corpusSizes],
      memoryCeilingMiB: PERF_CONFIG.memoryCeilingMiB,
      sampleIntervalMs: PERF_CONFIG.sampleIntervalMs,
    },
  };
}
