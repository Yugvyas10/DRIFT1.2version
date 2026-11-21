export { ENGINE_NAME, ENGINE_VERSION } from "./version.ts";
export { canonicalJson, CanonicalJsonError } from "./hash/canonical-json.ts";
export { contentHash, sha256Hex } from "./hash/content-hash.ts";
export { DEFAULT_LIMITS, type IngestLimits, type IngestOptions, type SpecReader } from "./ingest/types.ts";
export { ingestSpec, type IngestedSpec, type IngestResult, type SpecDocument } from "./ingest/ingest.ts";
export { reviveSpec, snapshotSpec, SPEC_SNAPSHOT_FORMAT, type SpecSnapshot } from "./ingest/snapshot.ts";
export type {
  MediaTypeIR,
  NormalizedSchema,
  OperationIR,
  ParameterIR,
  RequestBodyIR,
  ResponseIR,
  SecurityRequirementIR,
  SpecIR,
} from "./ingest/ir.ts";
export { changeId, diffSpecs, type DiffResult } from "./diff/diff.ts";
export type { Anchor, Slot } from "./diff/anchors.ts";
export { compare, specSummary, stageKey, type CompareInput, type StageEvent, type TrafficInput } from "./compare.ts";
export { readHar, readJsonl, toSample, type TrafficEntry } from "./corpus/traffic.ts";
export { DEFAULT_REDACTION, detect, redactSample, type RedactionOptions } from "./corpus/redact.ts";
export { buildCorpus, DEFAULT_CORPUS_OPTIONS, type Corpus, type CorpusOptions } from "./corpus/corpus.ts";
export { inspectTraffic, type TrafficInspection } from "./corpus/inspect.ts";
export { Router, type RouteMatch } from "./corpus/router.ts";
export type { RoutedSample, Sample } from "./corpus/sample.ts";
export {
  DEFAULT_VERIFY_OPTIONS,
  verify,
  type Evidence,
  type VerifyOptions,
  type VerifyResult,
} from "./verify/verify.ts";
export { ContractChecker, type ContractExchange, type ContractProblem } from "./verify/contract.ts";
export { assess, classify, globMatch, type ClassifyInput, type ClassifyResult } from "./classify/classify.ts";
export { parseSpecText as parseDataText, type ParseOutcome } from "./ingest/parse.ts";
// The CLI, Action and worker depend on core only; rules and policy loading is re-exported for them.
export { DEFAULT_POLICY, DEFAULT_RULESET, parseRuleset, Policy, type Ruleset } from "@drift/rules";
export { REPORT_FILES, REPORT_FORMATS, renderReport, type ReportFormat } from "./report/render.ts";
export { evidenceSummary, omittedBody } from "./report/common.ts";
export { renderConsole, type ConsoleOptions } from "./report/console.ts";
export { escapeMarkdown, MARKDOWN_MARKER, renderMarkdown, type MarkdownOptions } from "./report/markdown.ts";
export { escapeHtml, renderHtml } from "./report/html.ts";
export { renderSarif } from "./report/sarif.ts";
export { escapeXml, renderJunit } from "./report/junit.ts";
export type { StageCache } from "./compare.ts";
export { FAIL, RecordingPlan, SchemaGenerator, synthesizeRequest, type ChoicePlan } from "./corpus/synthesize.ts";
