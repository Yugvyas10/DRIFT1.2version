import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LIMITS, parseDataText, readJsonl, toSample } from "@drift/core";
import { describe, expect, it } from "vitest";
import { writeCorpus } from "./corpus.ts";
import { ingestText, runMutations, summarise, type MutationResult } from "./evaluate.ts";
import { renderEvaluation, type MutationResults } from "./evaluation.ts";
import { measure } from "./measure.ts";
import { mutate, MUTATION_OPERATORS } from "./mutations.ts";
import { expectedPage } from "./evaluation-files.ts";
import {
  cacheRun,
  corpusRuns,
  environment,
  fixtureRun,
  header,
  ingestFile,
  PERF_CONFIG,
  type PerfResults,
} from "./perf.ts";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const petstoreText = readFileSync(`${examples}petstore/v1.yaml`, "utf8");
const parsed = parseDataText(petstoreText, "v1.yaml", DEFAULT_LIMITS);
if (!parsed.ok) throw new Error("petstore does not parse");
const petstore = parsed.value as Record<string, unknown>;
const scratch = mkdtempSync(join(tmpdir(), "drift-bench-"));

describe("mutations", () => {
  it("applies every operator to a copy and labels it, or reports that there is no suitable place", () => {
    const before = JSON.stringify(petstore);
    const applied = MUTATION_OPERATORS.map((operator) => [
      operator,
      mutate(petstore as never, operator, 0)?.label ?? "none",
    ]);
    expect(Object.fromEntries(applied)).toEqual({
      "description-edited": "safe",
      "operation-added": "safe",
      "operation-removed": "breaking",
      "request-bound-relaxed": "safe",
      "request-bound-tightened": "breaking",
      "request-enum-value-removed": "none", // PetStatus is used by requests and responses, so it is not a request-only site
      "request-optional-field-added": "safe",
      "request-required-field-added": "breaking",
      "response-enum-value-added": "none",
    });
    expect(JSON.stringify(petstore)).toBe(before);
    expect(() => mutate(petstore as never, "nope", 0)).toThrow(/Unknown mutation operator/);
  });

  it("touches only components used by one side", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {
        "/x": {
          post: {
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/In" } } } },
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Out" } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          In: { type: "object", properties: { kind: { $ref: "#/components/schemas/Kind" } } },
          Out: { type: "object", properties: { kind: { type: "string", enum: ["a", "b"] } } },
          Kind: { type: "string", enum: ["x", "y"] },
        },
      },
    };
    expect(mutate(document as never, "request-enum-value-removed", 0)?.description).toMatch(
      /components\/schemas\/Kind$/
    );
    // Regression (first Benchmarks run): a component only webhooks use is not a site, since DRIFT skips webhooks.
    const hook = {
      post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Hook" } } } } },
    };
    const hooks = {
      ...document,
      paths: {},
      webhooks: { event: hook },
      "x-webhooks": { event: hook },
      components: { schemas: { Hook: { type: "string", enum: ["x", "y"] } } },
    };
    expect(mutate(hooks as never, "request-enum-value-removed", 0)).toBeUndefined();
    expect(mutate(document as never, "response-enum-value-added", 0)?.description).toMatch(/Out\/properties\/kind$/);
    expect(mutate({ openapi: "3.0.3" }, "operation-added", 0)).toBeUndefined();
  });
});

describe("runMutations and summarise", () => {
  it("compares the original with each mutant and records DRIFT's verdict next to the label", async () => {
    const { results, skipped } = await runMutations("petstore-v1", petstore, [0, 1]);
    expect(skipped).toEqual([
      "petstore-v1: request-enum-value-removed (no suitable place)",
      "petstore-v1: response-enum-value-added (no suitable place)",
    ]);
    const verdict = (operator: string) => results.find((r) => r.operator === operator)?.verdict;
    expect(verdict("operation-removed")).toBe("BREAKING");
    expect(verdict("request-required-field-added")).toBe("BREAKING");
    expect(verdict("request-bound-tightened")).toBe("BREAKING");
    expect(verdict("operation-added")).toBe("SAFE");
    expect(verdict("description-edited")).toBe("SAFE");
    expect(results.every((r) => (r.label === "safe" ? r.verdict !== "BREAKING" : true))).toBe(true);
  });

  it("counts proven, flagged and missed breaks, and false BREAKING on safe mutants", () => {
    const r = (label: "breaking" | "safe", verdict: MutationResult["verdict"]): MutationResult => ({
      spec: "s",
      operator: "o",
      label,
      description: "d",
      verdict,
      changes: 1,
      ms: 1,
    });
    expect(
      summarise([
        r("breaking", "BREAKING"),
        r("breaking", "RISKY"),
        r("breaking", "none"),
        r("safe", "BREAKING"),
        r("safe", "SAFE"),
      ])
    ).toEqual({
      breaking: { total: 3, proven: 1, flagged: 1, missed: 1 },
      safe: { total: 2, falseBreaking: 1, flagged: 0, clean: 1 },
      precision: 0.5,
      recall: 0.333,
    });
    expect(summarise([])).toMatchObject({ precision: null, recall: null });
  });

  it("refuses a document that is not a valid spec", async () => {
    await expect(ingestText("{}", "empty.json")).rejects.toThrow(/not a valid spec/);
  });
});

describe("performance harness", () => {
  it("measures time and peak memory", async () => {
    let now = 0;
    const { result, measurement } = await measure(
      () => Promise.resolve(42),
      5,
      () => (now += 100)
    );
    expect(result).toBe(42);
    expect(measurement.ms).toBe(100);
    expect(measurement.peakRssMiB).toBeGreaterThan(0);
  });

  it("writes valid, varied traffic for a contract", async () => {
    const spec = await ingestFile(`${examples}petstore/v1.yaml`);
    const file = join(scratch, "corpus.jsonl");
    const written = await writeCorpus(spec.ir, 40, file);
    expect(written.lines).toBe(40);
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    async function* source() {
      await Promise.resolve();
      yield* lines;
    }
    const methods = new Set<string>();
    for await (const entry of readJsonl(source())) {
      if ("malformed" in entry) throw new Error(entry.malformed);
      methods.add(toSample(entry.line, entry.record).method);
    }
    expect([...methods].sort()).toEqual(["DELETE", "GET", "POST"]);
  });

  it("runs the corpus and cache benchmarks at small sizes", async () => {
    const base = await ingestFile(`${examples}petstore/v1.yaml`);
    const head = await ingestFile(`${examples}petstore/v2-breaking.yaml`);
    const [run] = await corpusRuns(base, head, [200], scratch);
    expect(run).toMatchObject({ lines: 200, withinCeiling: true });
    expect(run?.kept).toBeGreaterThan(0);
    const cache = await cacheRun(base, head, 200, scratch);
    expect(cache.lines).toBe(200);
    expect(environment().cores).toBeGreaterThan(0);
    expect(header()).toMatchObject({
      kind: "drift-perf/v1",
      config: { memoryCeilingMiB: PERF_CONFIG.memoryCeilingMiB },
    });
  });
});

describe("fixture benchmark", () => {
  // The real fixtures are too large for unit tests; the petstore example exercises the same code path.
  it("ingests, compares a spec with itself and with a mutant", async () => {
    const run = await fixtureRun("petstore", `${examples}petstore/v1.yaml`);
    expect(run).toMatchObject({ id: "petstore", operations: 4, selfCompare: { changes: 0 } });
    expect(run.mutatedCompare.breaking).toBeGreaterThan(0);
    await expect(fixtureRun("missing", `${examples}petstore/nope.yaml`)).rejects.toThrow(/does not ingest/);
  });
});

describe("EVALUATION.md", () => {
  it("is rendered from the committed result files", async () => {
    expect(await expectedPage()).toMatch(/^# Evaluation\n/);
  });
});

describe("renderEvaluation", () => {
  const run = {
    ms: 1500,
    peakRssMiB: 100,
    peakHeapMiB: 50,
    lines: 1000,
    fileMiB: 0.2,
    linesPerSecond: 667,
    kept: 1000,
    withinCeiling: true,
  };
  const perf: PerfResults = {
    kind: "drift-perf/v1",
    engineVersion: "0.0.0",
    environment: { node: "v24", platform: "linux-x64", cpu: "Test CPU", cores: 4, memoryGiB: 16 },
    generatedAt: "2026-09-28T12:00:00.000Z",
    config: { corpusSizes: [1000, 10000], memoryCeilingMiB: 512, sampleIntervalMs: 25 },
    corpus: { spec: "a.yaml", head: "b.yaml", runs: [run, { ...run, lines: 10000, ms: 12_000, withinCeiling: false }] },
    cache: {
      cold: { ms: 900, peakRssMiB: 1, peakHeapMiB: 1 },
      warm: { ms: 30, peakRssMiB: 1, peakHeapMiB: 1 },
      lines: 1000,
    },
    fixtures: [],
    fixturesSkipped: "not downloaded",
  };
  const mutations: MutationResults = {
    kind: "drift-mutations/v1",
    engineVersion: "0.0.0",
    generatedAt: "2026-09-28T12:00:00.000Z",
    seeds: [0],
    specs: ["s"],
    summary: summarise([]),
    results: [{ spec: "s", operator: "o", label: "safe", description: "a | b", verdict: "SAFE", changes: 1, ms: 1 }],
    skipped: ["s: x (no suitable place)"],
  };

  it("renders only numbers from the result files", () => {
    const page = renderEvaluation(perf, mutations);
    expect(page).toContain("Test CPU (4 cores)");
    expect(page).toContain("| 10,000 | 0.2 MiB | 12.0 s |");
    expect(page).toContain("**no**");
    expect(page).toContain("Time per line changes by a factor of 0.80");
    expect(page).toContain("Not measured: not downloaded.");
    expect(page).toContain("precision **n/a**");
    expect(page).toContain("a \\| b");
    expect(page).toContain("Operators with no suitable place");
  });

  it("says so when nothing was measured, and renders fixture rows", () => {
    expect(renderEvaluation(undefined, undefined)).toContain("Not measured yet.");
    const fixture = {
      id: "big",
      operations: 1200,
      ingest: { ms: 7000, peakRssMiB: 600, peakHeapMiB: 1 },
      selfCompare: { ms: 400, peakRssMiB: 700, peakHeapMiB: 1, changes: 0 },
      mutatedCompare: { ms: 900, peakRssMiB: 650, peakHeapMiB: 1, changes: 3, breaking: 2, mutation: "x" },
    };
    const page = renderEvaluation({ ...perf, corpus: { ...perf.corpus, runs: [run] }, fixtures: [fixture] }, undefined);
    expect(page).toContain("| big | 1,200 | 7000 ms | 400 ms | 0 | 900 ms | 3 (2) | 700 MiB |");
  });
});
