import { z } from "zod";
import { Change } from "./change.ts";
import { SpecSummary } from "./diff-output.ts";
import { Direction, FailOn, REPORT_SCHEMA_ID, Severity } from "./vocabulary.ts";

const Count = z.number().int().nonnegative();
const Hash = z.string().regex(/^[0-9a-f]{64}$/);

/** Where a sample came from. Synthetic samples are generated from the contract and always labelled as such. */
export const SampleOrigin = z.enum(["recorded", "synthetic"]);
export type SampleOrigin = z.infer<typeof SampleOrigin>;

/** One validation error of a sample, located in the sample (`/body/status`, `/query/limit`, `/operation`). */
export const SampleError = z.object({
  pointer: z.string(),
  keyword: z.string(),
  message: z.string(),
});
export type SampleError = z.infer<typeof SampleError>;

/**
 * A concrete sample, redacted. In the request direction it is a request that the old contract accepts
 * and the new one rejects; in the response direction a response the new contract allows and the old one rejects.
 */
export const EvidenceExample = z.object({
  sample: z.string(),
  origin: SampleOrigin,
  /** Line in the traffic file, for recorded samples. */
  line: z.number().int().positive().optional(),
  /** The redacted sample: `method`, `path`, `query`, `headers`, `body`, or for responses `status`, `contentType`, `body`. */
  payload: z.json(),
  /** JSON pointers in `payload` whose values were redacted. */
  redacted: z.array(z.string()),
  errors: z.array(SampleError),
  /**
   * Set when the body was too large to include (for example a generated response of a big API): `payload` then has
   * no `body`, `bytes` is its size, and `values` holds the value at each error pointer inside it (small ones only).
   */
  bodyOmitted: z.object({ bytes: Count, values: z.record(z.string(), z.json()) }).optional(),
});
export type EvidenceExample = z.infer<typeof EvidenceExample>;

/**
 * - `failing`: at least one sample proves the break.
 * - `passing`: samples reached the change and none failed.
 * - `no_samples`: no sample reached the change.
 * - `not_verifiable`: no sample can prove or disprove this kind of change (e.g. a removed response status).
 */
export const EvidenceStatus = z.enum(["failing", "passing", "no_samples", "not_verifiable"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

const ByOrigin = z.object({ recorded: Count, synthetic: Count });

export const ChangeEvidence = z.object({
  status: EvidenceStatus,
  /** Samples that reached the change (its operation, direction and part of the message). */
  checked: ByOrigin,
  /** Samples that fail because of this change. */
  failed: ByOrigin,
  /** Samples whose only failures are at redacted values, so the result is unknown (never a failure). */
  unknown: Count,
  examples: z.array(EvidenceExample),
});
export type ChangeEvidence = z.infer<typeof ChangeEvidence>;

export const Suppression = z.object({
  reason: z.string(),
  expiresAt: z.string(),
});

/** A change with its label (ADR-0002). */
export const ClassifiedChange = Change.extend({
  severity: Severity,
  ruleId: z.string().regex(/^DRIFT(?:-[A-Z0-9]+)+$/),
  rationale: z.string(),
  /** In [0, 1]; null when the change is not verifiable by samples (the label is structural only). */
  confidence: z.number().min(0).max(1).nullable(),
  /** True when no recorded sample reached the change, so the label rests on synthetic samples or structure alone. */
  unverified: z.boolean(),
  evidence: ChangeEvidence,
  /** Set when a policy escalation raised the structural label. */
  escalation: z.string().optional(),
  /** Set when a suppression applies: the change is reported but does not count towards the gate. */
  suppression: Suppression.optional(),
  /** Where `location` is in the source: the display path of the file on `side`, 1-based line and column. */
  position: z
    .object({ file: z.string(), line: z.number().int().positive(), column: z.number().int().positive() })
    .optional(),
});
export type ClassifiedChange = z.infer<typeof ClassifiedChange>;

export const CorpusSummary = z.object({
  source: z.object({ kind: z.enum(["none", "jsonl", "har"]), file: z.string().optional() }),
  recorded: z.object({
    /** Lines (JSONL) or entries (HAR) read. */
    read: Count,
    malformed: Count,
    /** The first malformed lines, with the reason. Never contains the line itself. */
    malformedExamples: z.array(z.object({ line: z.number().int().positive(), reason: z.string() })),
    /** Records that match no operation of the old contract. */
    unrouted: Count,
    /** Records for operations that no change affects. */
    outOfScope: Count,
    /** Records kept after sampling, and the caps that applied. */
    sampled: Count,
    perOperationCap: Count,
    totalCap: Count,
  }),
  synthetic: z.object({
    generated: Count,
    /** Generated samples that the contract they were generated from rejects; they are never used as evidence. */
    discarded: Count,
    seed: z.number().int(),
  }),
  redaction: z.object({ samples: Count, values: Count }),
  coverage: z.object({
    /** Operations with at least one change. */
    affectedOperations: Count,
    /** Of those, operations reached by at least one recorded sample. */
    withRecordedSamples: Count,
  }),
});
export type CorpusSummary = z.infer<typeof CorpusSummary>;

/** Samples that fail under the new contract for a reason no detected change explains. */
export const UnattributedFailure = z.object({
  operation: z.string(),
  direction: Direction,
  count: Count,
  example: EvidenceExample,
});
export type UnattributedFailure = z.infer<typeof UnattributedFailure>;

export const ReportDiagnostic = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
});
export type ReportDiagnostic = z.infer<typeof ReportDiagnostic>;

export const StageName = z.enum(["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"]);
export type StageName = z.infer<typeof StageName>;

/** The full result of `drift compare` (PLAN §4.6). */
export const Report = z
  .object({
    format: z.literal(REPORT_SCHEMA_ID),
    engine: z.object({ name: z.string(), version: z.string() }),
    rules: z.object({ version: z.string(), hash: Hash }),
    policy: z.object({ hash: Hash, failOn: FailOn }),
    base: SpecSummary,
    head: SpecSummary,
    corpus: CorpusSummary,
    changes: z.array(ClassifiedChange),
    unattributed: z.array(UnattributedFailure),
    /** Recorded requests the old contract already rejects, and recorded responses the new contract rejects. Informational. */
    nonConformance: z.object({ requests: Count, responses: Count }),
    summary: z.object({ breaking: Count, risky: Count, safe: Count, suppressed: Count }),
    semver: z.enum(["major", "minor", "patch"]),
    gate: z.object({ failOn: FailOn, passed: z.boolean() }),
    /**
     * Content-addressed key of every stage output (ADR-0006). Named `hash`, not `cacheKey`: secret scanners
     * read a 64-hex value under a name containing "key" as an API key, and reports get committed and posted.
     */
    stages: z.array(
      z.object({
        stage: StageName,
        hash: Hash,
        /** True when the output was reused from the cache instead of computed (ADR-0006). */
        cached: z.boolean(),
      })
    ),
    diagnostics: z.array(ReportDiagnostic),
  })
  .meta({
    id: "drift-report-v1",
    title: "DRIFT report (drift-report/v1)",
    description: "The result of comparing two OpenAPI contracts, with evidence for every label.",
  });
export type Report = z.infer<typeof Report>;
