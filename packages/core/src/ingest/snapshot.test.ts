import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compare, type StageEvent } from "../compare.ts";
import { ingestSpec } from "./ingest.ts";
import type { SpecReader } from "./types.ts";
import { reviveSpec, snapshotSpec, SPEC_SNAPSHOT_FORMAT } from "./snapshot.ts";

const dir = fileURLToPath(new URL("../../../../examples/petstore/", import.meta.url));
const reader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};

async function load(name: string) {
  const result = await ingestSpec(`${dir}${name}`, { reader, displayPath: (path) => path.slice(dir.length) });
  if (!result.spec) throw new Error(`invalid ${name}`);
  return { spec: result.spec, text: await readFile(`${dir}${name}`, "utf8") };
}

describe("spec snapshots", () => {
  it("restore a spec that compares exactly like the freshly ingested one, positions included", async () => {
    const [base, head] = await Promise.all([load("v1.yaml"), load("v2-breaking.yaml")]);
    const snapshot = JSON.parse(JSON.stringify(snapshotSpec(base.spec))) as unknown;
    expect(snapshot).toMatchObject({
      format: SPEC_SNAPSHOT_FORMAT,
      file: "v1.yaml",
      documents: [{ relative: "", display: "v1.yaml" }],
    });

    const revived = reviveSpec(snapshot, new Map([["", base.text]]));
    expect(revived?.cached).toBe(true);
    expect(revived?.specHash).toBe(base.spec.specHash);
    const fresh = await compare({ base: base.spec, head: head.spec, asOf: "2026-10-02" });
    const restored = await compare({ base: revived ?? base.spec, head: head.spec, asOf: "2026-10-02" });
    // Same report, except that the restored Ingest stage is marked as a cache hit.
    expect(restored.stages[0]).toEqual({ ...fresh.stages[0], cached: true });
    expect({ ...restored, stages: [] }).toEqual({ ...fresh, stages: [] });
    expect(restored.changes.some((change) => change.position?.file === "v1.yaml")).toBe(true);
  });

  it("refuse anything that is not an intact snapshot with its sources", async () => {
    const { spec, text } = await load("v1.yaml");
    const good = snapshotSpec(spec);
    const sources = new Map([["", text]]);
    expect(reviveSpec(good, sources)).toBeDefined();
    expect(reviveSpec(good, new Map())).toBeUndefined(); // a source file is missing
    expect(reviveSpec({ ...good, format: "drift-spec-snapshot/v0" }, sources)).toBeUndefined();
    expect(reviveSpec({ ...good, line: "2.0" }, sources)).toBeUndefined();
    expect(reviveSpec({ ...good, documents: [{ relative: 1 }] }, sources)).toBeUndefined();
    // A damaged or tampered IR no longer matches its recorded hash.
    expect(reviveSpec({ ...good, ir: { ...good.ir, operations: {} } }, sources)).toBeUndefined();
    expect(reviveSpec({ ...good, ir: undefined }, sources)).toBeUndefined();
    for (const junk of [null, "text", 5, [], {}]) expect(reviveSpec(junk, sources)).toBeUndefined();
  });
});

describe("compare: stage events", () => {
  it("reports each stage as it starts and finishes, in order, and whether it came from the cache", async () => {
    const [base, head] = await Promise.all([load("v1.yaml"), load("v2-breaking.yaml")]);
    const store = new Map<string, string>();
    const cache = {
      get: (hash: string) => Promise.resolve(store.get(hash)),
      put: (hash: string, value: string) => Promise.resolve(void store.set(hash, value)),
    };
    const run = async () => {
      const events: StageEvent[] = [];
      const report = await compare({
        base: base.spec,
        head: head.spec,
        asOf: "2026-10-02",
        cache,
        onStage: (event) => void events.push(event),
      });
      return { events, report };
    };
    const first = await run();
    expect(
      first.events.map((e) => `${e.stage} ${e.status}${e.status === "finished" ? ` cached=${String(e.cached)}` : ""}`)
    ).toEqual([
      "diff started",
      "diff finished cached=false",
      "corpus started",
      "corpus finished cached=false",
      "verify started",
      "verify finished cached=false",
      "classify started",
      "classify finished cached=false",
    ]);
    const second = await run();
    expect(second.events.filter((e) => e.status === "finished").every((e) => e.cached)).toBe(true);
    // The events carry the same keys as the report's stage list.
    const hashes = Object.fromEntries(second.report.stages.map((s) => [s.stage, s.hash]));
    for (const event of second.events) expect(event.hash).toBe(hashes[event.stage]);
    // A damaged cache entry is recomputed, and still reported once.
    const diffHash = hashes.diff ?? "";
    store.set(diffHash, "{not json");
    const repaired = await run();
    expect(repaired.events.filter((e) => e.stage === "diff")).toEqual([
      { stage: "diff", status: "started", hash: diffHash },
      { stage: "diff", status: "finished", hash: diffHash, cached: false },
    ]);
  });
});
