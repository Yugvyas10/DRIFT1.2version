import { describe, expect, it } from "vitest";
import { ingestObject, openapi } from "../testing/specs.ts";
import { buildCorpus, DEFAULT_CORPUS_OPTIONS } from "./corpus.ts";
import type { TrafficEntry } from "./traffic.ts";

const ok = { responses: { "200": { description: "ok" } } };
const spec = async () =>
  (
    await ingestObject(
      openapi({
        "/a": { get: ok },
        "/b": { get: ok },
        "/c": { get: ok },
      })
    )
  ).ir;

function entries(paths: string[]): TrafficEntry[] {
  return paths.map((path, index) => ({ line: index + 1, record: { method: "GET", path } }));
}

const affected = new Set(["GET /a", "GET /b"]);

describe("buildCorpus", () => {
  it("counts malformed, unrouted and out-of-scope records and keeps the rest, sorted", async () => {
    const input: TrafficEntry[] = [
      ...entries(["/b", "/a", "/zzz", "/c"]),
      { line: 5, malformed: "not valid JSON" },
      { line: 6, malformed: "record: unknown field" },
    ];
    const corpus = await buildCorpus(input, await spec(), affected, {
      ...DEFAULT_CORPUS_OPTIONS,
      maxMalformedExamples: 1,
    });
    expect(corpus.stats).toEqual({
      read: 6,
      malformed: 2,
      malformedExamples: [{ line: 5, reason: "not valid JSON" }],
      unrouted: 1,
      outOfScope: 1,
      sampled: 2,
    });
    expect(corpus.samples.map((sample) => [sample.operation, sample.line])).toEqual([
      ["GET /a", 2],
      ["GET /b", 1],
    ]);
  });

  it("caps samples per operation and shares the total cap in turns across operations", async () => {
    const paths = [...Array.from({ length: 50 }, () => "/a"), ...Array.from({ length: 3 }, () => "/b")];
    const options = { ...DEFAULT_CORPUS_OPTIONS, perOperationCap: 10, totalCap: 8 };
    const corpus = await buildCorpus(entries(paths), await spec(), affected, options);
    const count = (operation: string) => corpus.samples.filter((sample) => sample.operation === operation).length;
    expect(count("GET /b")).toBe(3);
    expect(count("GET /a")).toBe(5);
    expect(corpus.stats.sampled).toBe(8);
  });

  it("keeps the same samples whatever the order of the input, and a different set for another seed", async () => {
    const lines = entries(Array.from({ length: 40 }, () => "/a"));
    const options = { ...DEFAULT_CORPUS_OPTIONS, perOperationCap: 5 };
    const ir = await spec();
    const kept = async (input: TrafficEntry[], seed: number) =>
      (await buildCorpus(input, ir, affected, { ...options, seed })).samples.map((sample) => sample.line);
    const forward = await kept(lines, 0);
    expect(await kept([...lines].reverse(), 0)).toEqual(forward);
    expect(await kept(lines, 1)).not.toEqual(forward);
    expect(forward).toHaveLength(5);
  });

  it("redacts every kept sample", async () => {
    const input: TrafficEntry[] = [
      { line: 1, record: { method: "GET", path: "/a", headers: { Authorization: "Basic abc" } } },
    ];
    const corpus = await buildCorpus(input, await spec(), affected);
    expect(corpus.samples[0]?.headers).toEqual({ authorization: ["[REDACTED:header]"] });
    expect(corpus.samples[0]?.redacted).toEqual(["/headers/authorization"]);
  });
});
