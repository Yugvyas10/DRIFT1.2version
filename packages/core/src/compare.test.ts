import { readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Report } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { compare, stageKey, type CompareInput } from "./compare.ts";
import { readHar, readJsonl } from "./corpus/traffic.ts";
import { sha256Hex } from "./hash/content-hash.ts";
import { ingestSpec } from "./ingest/ingest.ts";
import type { SpecReader } from "./ingest/types.ts";
import { ingestObject, sharedComponentPair } from "./testing/specs.ts";

/** The M2 acceptance example (examples/petstore). */
const dir = fileURLToPath(new URL("../../../examples/petstore/", import.meta.url));
const reader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};
const trafficText = readFileSync(`${dir}traffic.jsonl`, "utf8");

async function spec(name: string) {
  const result = await ingestSpec(`${dir}${name}`, { reader, displayPath: (path) => path.slice(dir.length) });
  if (!result.spec) throw new Error(`invalid ${name}`);
  return result.spec;
}

async function* lines(text: string) {
  await Promise.resolve();
  yield* text.split("\n");
}

async function run(head = "v2-breaking.yaml", overrides: Partial<CompareInput> = {}, traffic = true): Promise<Report> {
  return compare({
    base: await spec("v1.yaml"),
    head: await spec(head),
    asOf: "2026-09-28",
    ...(traffic
      ? {
          traffic: {
            kind: "jsonl",
            file: "traffic.jsonl",
            hash: sha256Hex(trafficText),
            open: () => readJsonl(lines(trafficText)),
          },
        }
      : {}),
    ...overrides,
  });
}

describe("compare (M2 acceptance, examples/petstore)", () => {
  it("reports BREAKING changes with a redacted recorded failing payload", async () => {
    const report = await run();
    expect(report.gate).toEqual({ failOn: "breaking", passed: false });
    const enumRemoved = report.changes.find(
      (change) => change.kind === "schema.enum.value_removed" && change.operation === "POST /pets"
    );
    expect(enumRemoved).toMatchObject({
      severity: "BREAKING",
      confidence: 1,
      unverified: false,
      evidence: { status: "failing", failed: { recorded: 1, synthetic: 0 } },
    });
    const [example] = enumRemoved?.evidence.examples ?? [];
    expect(example).toMatchObject({
      origin: "recorded",
      line: 1,
      redacted: ["/body/ownerEmail", "/headers/authorization"],
      payload: { body: { status: "pending", ownerEmail: "[REDACTED:email]" } },
    });
    expect(report.corpus.recorded).toMatchObject({ read: 12, malformed: 2, unrouted: 1, sampled: 9 });
    expect(report.nonConformance).toEqual({ requests: 1, responses: 1 });
    expect(report.unattributed).toEqual([]);
    expect(report.semver).toBe("major");
  });

  it("reports synthetic evidence, marked as synthetic, when there is no traffic", async () => {
    const report = await run("v2-breaking.yaml", {}, false);
    const breaking = report.changes.filter((change) => change.severity === "BREAKING");
    expect(breaking.length).toBeGreaterThan(0);
    for (const change of breaking) {
      expect(change.evidence.failed.recorded).toBe(0);
      expect(change.evidence.examples.every((example) => example.origin === "synthetic")).toBe(true);
      expect(change.confidence).toBeLessThan(1);
      expect(change.unverified).toBe(true);
    }
    expect(report.corpus.source).toEqual({ kind: "none" });
    expect(report.diagnostics.map((d) => d.code)).toEqual(["NO_TRAFFIC", "SYNTHETIC_EVIDENCE"]);
  });

  it("warns when the synthetic budget cut samples short, and still proves the change everywhere", async () => {
    const pair = sharedComponentPair(400);
    const [base, head] = await Promise.all([ingestObject(pair.base), ingestObject(pair.head)]);
    const report = await compare({ base, head, asOf: "2026-09-28" });
    expect(report.changes).toHaveLength(400);
    expect(report.changes.every((change) => change.severity === "BREAKING")).toBe(true);
    const warning = report.diagnostics.find((d) => d.code === "SYNTHETIC_BUDGET");
    expect(warning).toMatchObject({ level: "warning" });
    expect(warning?.message).toMatch(
      /^400 operations or responses needed synthetic samples, so broad-coverage samples stopped at 10 for each /
    );
  });

  it("passes an additive change and recommends a minor version", async () => {
    const report = await run("v2-additive.yaml");
    expect(report.gate.passed).toBe(true);
    expect(report.summary.breaking + report.summary.risky).toBe(0);
    expect(report.semver).toBe("minor");
  });

  // M2 acceptance: secrets planted in the corpus appear in no output.
  it("never lets a planted secret reach the report", async () => {
    const text = JSON.stringify(await run());
    const planted = [
      "eyJhbGci",
      "alice@example.com",
      "4111",
      "AKIA",
      "bob@example.com",
      "4000 0566",
      "gsk_",
      "c2lnbmF0",
    ];
    for (const secret of planted) {
      expect(trafficText).toContain(secret);
      expect(text).not.toContain(secret);
    }
  });

  it("is deterministic and keys every stage by its inputs (ADR-0006)", async () => {
    const [a, b] = [await run(), await run()];
    expect(a).toEqual(b);
    expect(a.stages.map((stage) => stage.stage)).toEqual([
      "ingest.base",
      "ingest.head",
      "diff",
      "corpus",
      "verify",
      "classify",
    ]);
    const other = await run("v2-breaking.yaml", { seed: 1 });
    const keys = (report: Report) => Object.fromEntries(report.stages.map((stage) => [stage.stage, stage.hash]));
    expect(a.stages.every((stage) => !stage.cached)).toBe(true);
    expect(keys(other).diff).toBe(keys(a).diff);
    expect(keys(other).corpus).not.toBe(keys(a).corpus);
    const policy = await run("v2-breaking.yaml", { failOn: "risky" });
    expect(keys(policy).verify).toBe(keys(a).verify);
    expect(keys(policy).classify).not.toBe(keys(a).classify);
    expect(stageKey("diff", { a: 1, b: 2 })).toBe(stageKey("diff", { b: 2, a: 1 }));
  });

  it("reads HAR traffic", async () => {
    const har = {
      log: {
        entries: [
          {
            request: {
              method: "DELETE",
              url: "https://api.example.com/v1/pets/7",
              headers: [{ name: "Authorization", value: "Bearer abc.def.ghi" }],
            },
            response: { status: 204 },
          },
        ],
      },
    };
    const report = await run("v2-breaking.yaml", {
      traffic: { kind: "har", file: "capture.har", hash: "0".repeat(64), open: () => readHar(har) },
    });
    const removed = report.changes.find((change) => change.kind === "operation.removed");
    expect(removed?.evidence.failed.recorded).toBe(1);
    expect(report.corpus.source).toEqual({ kind: "har", file: "capture.har" });
  });

  it("reuses cached stage outputs when their inputs did not change (ADR-0006)", async () => {
    const store = new Map<string, string>();
    const cache = {
      get: (hash: string) => Promise.resolve(store.get(hash)),
      put: (hash: string, value: string) => {
        store.set(hash, value);
        return Promise.resolve();
      },
    };
    const first = await run("v2-breaking.yaml", { cache });
    expect(first.stages.filter((stage) => stage.cached)).toEqual([]);
    const opened: string[] = [];
    const second = await run("v2-breaking.yaml", {
      cache,
      traffic: {
        kind: "jsonl",
        file: "traffic.jsonl",
        hash: sha256Hex(trafficText),
        open: () => {
          opened.push("traffic");
          return readJsonl(lines(trafficText));
        },
      },
    });
    expect(second.stages.map((stage) => [stage.stage, stage.cached])).toEqual([
      ["ingest.base", false],
      ["ingest.head", false],
      ["diff", true],
      ["corpus", true],
      ["verify", true],
      ["classify", true],
    ]);
    expect(opened).toEqual([]);
    const strip = (report: Report) => ({
      ...report,
      stages: report.stages.map(({ stage, hash }) => ({ stage, hash })),
    });
    expect(strip(second)).toEqual(strip(first));

    // A new policy re-runs Classify only; a damaged entry is recomputed.
    const policyRun = await run("v2-breaking.yaml", { cache, failOn: "risky" });
    expect(policyRun.stages.filter((stage) => !stage.cached).map((stage) => stage.stage)).toEqual([
      "ingest.base",
      "ingest.head",
      "classify",
    ]);
    for (const key of store.keys()) store.set(key, "{damaged");
    const recovered = await run("v2-breaking.yaml", { cache });
    expect(strip(recovered)).toEqual(strip(first));
  });
});
