import {
  REPORT_SCHEMA_ID,
  Report,
  type CorpusSummary,
  type FailOn,
  type ReportDiagnostic,
  type SpecSummary,
  type StageName,
} from "@drift/report-schema";
import { DEFAULT_POLICY, DEFAULT_RULESET, type Policy, type Ruleset } from "@drift/rules";
import { classify } from "./classify/classify.ts";
import { buildCorpus, DEFAULT_CORPUS_OPTIONS, type CorpusOptions } from "./corpus/corpus.ts";
import type { TrafficEntry } from "./corpus/traffic.ts";
import { diffSpecs } from "./diff/diff.ts";
import { contentHash } from "./hash/content-hash.ts";
import type { IngestedSpec } from "./ingest/ingest.ts";
import { DEFAULT_VERIFY_OPTIONS, verify } from "./verify/verify.ts";
import { ENGINE_NAME, ENGINE_VERSION } from "./version.ts";

export interface TrafficInput {
  kind: "jsonl" | "har";
  /** Display path, shown in the report. */
  file?: string;
  /** SHA-256 of the traffic file's bytes: the Corpus stage's input hash (ADR-0006). */
  hash: string;
  entries: AsyncIterable<TrafficEntry> | Iterable<TrafficEntry>;
}

export interface CompareInput {
  base: IngestedSpec;
  head: IngestedSpec;
  traffic?: TrafficInput;
  ruleset?: Ruleset;
  policy?: Policy;
  /** Overrides the policy's `failOn`. */
  failOn?: FailOn;
  /** Date (YYYY-MM-DD) suppressions are checked against. */
  asOf: string;
  /** Rotates which recorded samples are kept and how synthetic samples are swept; deterministic. */
  seed?: number;
  corpus?: Partial<Pick<CorpusOptions, "perOperationCap" | "totalCap" | "redaction">>;
}

export function specSummary(spec: IngestedSpec): SpecSummary {
  return {
    file: spec.file,
    oasVersion: spec.oasVersion,
    title: spec.ir.info.title,
    version: spec.ir.info.version,
    specHash: spec.specHash,
    operations: Object.keys(spec.ir.operations).length,
  };
}

/** Content-addressed key of a stage output: its name, the engine version and the hashes of its inputs (ADR-0006). */
export function stageKey(stage: string, inputs: Record<string, unknown>): string {
  return contentHash({ stage, engine: ENGINE_VERSION, inputs });
}

/**
 * Runs Diff → Corpus → Verify → Classify on two ingested contracts and returns a `drift-report/v1` report,
 * validated against its schema. Report & Gate formats other than JSON arrive in M3 (PLAN §6).
 */
export async function compare(input: CompareInput): Promise<Report> {
  const ruleset = input.ruleset ?? DEFAULT_RULESET;
  const policy = input.policy ?? DEFAULT_POLICY;
  const seed = input.seed ?? 0;
  const corpusOptions: CorpusOptions = { ...DEFAULT_CORPUS_OPTIONS, ...input.corpus, seed };
  const verifyOptions = { ...DEFAULT_VERIFY_OPTIONS, seed };
  const diagnostics: ReportDiagnostic[] = [];

  const stages: { stage: StageName; hash: string }[] = [];
  const key = (stage: StageName, inputs: Record<string, unknown>) => {
    const hash = stageKey(stage, inputs);
    stages.push({ stage, hash });
    return hash;
  };
  key("ingest.base", { source: input.base.sourceHash });
  key("ingest.head", { source: input.head.sourceHash });
  const diffKey = key("diff", { base: input.base.specHash, head: input.head.specHash });
  const diff = diffSpecs(input.base.ir, input.head.ir);

  const affected = new Set(Object.keys(diff.impact));
  const corpus = input.traffic
    ? await buildCorpus(input.traffic.entries, input.base.ir, affected, corpusOptions)
    : { samples: [], stats: { read: 0, malformed: 0, malformedExamples: [], unrouted: 0, outOfScope: 0, sampled: 0 } };
  const corpusKey = key("corpus", {
    diff: diffKey,
    traffic: input.traffic?.hash ?? null,
    options: {
      perOperationCap: corpusOptions.perOperationCap,
      totalCap: corpusOptions.totalCap,
      seed,
      redaction: corpusOptions.redaction,
    },
  });

  const verified = verify(input.base.ir, input.head.ir, diff, corpus.samples, verifyOptions);
  const verifyKey = key("verify", { diff: diffKey, corpus: corpusKey, options: verifyOptions });

  const rulesHash = contentHash(ruleset);
  const policyHash = contentHash(policy);
  const classified = classify({
    changes: diff.changes,
    evidence: verified.evidence,
    ruleset,
    policy,
    asOf: input.asOf,
    ...(input.failOn === undefined ? {} : { failOn: input.failOn }),
  });
  key("classify", {
    verify: verifyKey,
    rules: rulesHash,
    policy: policyHash,
    asOf: input.asOf,
    failOn: classified.gate.failOn,
  });

  const sampledOperations = new Set(corpus.samples.map((sample) => sample.operation));
  const corpusSummary: CorpusSummary = {
    source: input.traffic
      ? { kind: input.traffic.kind, ...(input.traffic.file === undefined ? {} : { file: input.traffic.file }) }
      : { kind: "none" },
    recorded: {
      ...corpus.stats,
      perOperationCap: corpusOptions.perOperationCap,
      totalCap: corpusOptions.totalCap,
    },
    synthetic: { ...verified.synthetic, seed },
    redaction: {
      samples: corpus.samples.filter((sample) => sample.redacted.length > 0).length,
      values: corpus.samples.reduce((total, sample) => total + sample.redacted.length, 0),
    },
    coverage: {
      affectedOperations: affected.size,
      withRecordedSamples: [...affected].filter((operation) => sampledOperations.has(operation)).length,
    },
  };

  if (!input.traffic) {
    diagnostics.push({
      level: "info",
      code: "NO_TRAFFIC",
      message: "No traffic was given: request evidence comes from synthetic samples only.",
    });
  }
  if (corpus.stats.malformed > 0) {
    diagnostics.push({
      level: "warning",
      code: "TRAFFIC_MALFORMED",
      message: `${String(corpus.stats.malformed)} traffic records could not be read and were skipped.`,
    });
  }
  if (verified.synthetic.generated > 0) {
    diagnostics.push({
      level: "info",
      code: "SYNTHETIC_EVIDENCE",
      message: `${String(verified.synthetic.generated)} synthetic samples were generated from the contracts; evidence from them is marked synthetic and has lower confidence.`,
    });
  }
  if (verified.unattributed.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "UNATTRIBUTED_FAILURES",
      message: "Some samples fail under the new contract for a reason no detected change explains (see unattributed).",
    });
  }
  for (const note of verified.notes) diagnostics.push({ level: "warning", code: "NOT_CHECKED", message: note });
  diagnostics.push(...classified.diagnostics);

  return Report.parse({
    format: REPORT_SCHEMA_ID,
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
    rules: { version: ruleset.version, hash: rulesHash },
    policy: { hash: policyHash, failOn: classified.gate.failOn },
    base: specSummary(input.base),
    head: specSummary(input.head),
    corpus: corpusSummary,
    changes: classified.changes,
    unattributed: verified.unattributed,
    nonConformance: verified.nonConformance,
    summary: classified.summary,
    semver: classified.semver,
    gate: classified.gate,
    stages,
    diagnostics,
  });
}
