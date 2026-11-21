export { ENGINE_NAME, ENGINE_VERSION } from "./version.ts";
export { canonicalJson, CanonicalJsonError } from "./hash/canonical-json.ts";
export { contentHash, sha256Hex } from "./hash/content-hash.ts";
export { DEFAULT_LIMITS, type IngestLimits, type IngestOptions, type SpecReader } from "./ingest/types.ts";
export { ingestSpec, type IngestedSpec, type IngestResult } from "./ingest/ingest.ts";
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
