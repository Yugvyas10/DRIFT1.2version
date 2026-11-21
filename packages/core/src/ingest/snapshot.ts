import { contentHash } from "../hash/content-hash.ts";
import { isJsonObject } from "../util/json.ts";
import { locator, type IngestedSpec, type SpecDocument } from "./ingest.ts";
import type { SpecIR } from "./ir.ts";
import { PositionIndex } from "./positions.ts";

export const SPEC_SNAPSHOT_FORMAT = "drift-spec-snapshot/v1";

/**
 * An ingested spec as plain JSON, so the Ingest stage's output can be kept in a cache (ADR-0006) and restored
 * without parsing, validating and normalising the contract again. Line and column lookups are not stored: they
 * are rebuilt lazily from the source text when a report needs them, so a restored spec gives exactly the same
 * report as a freshly ingested one.
 */
export interface SpecSnapshot {
  format: typeof SPEC_SNAPSHOT_FORMAT;
  file: string;
  oasVersion: string;
  line: IngestedSpec["line"];
  ir: SpecIR;
  specHash: string;
  sourceHash: string;
  documents: SpecDocument[];
}

export function snapshotSpec(spec: IngestedSpec): SpecSnapshot {
  return {
    format: SPEC_SNAPSHOT_FORMAT,
    file: spec.file,
    oasVersion: spec.oasVersion,
    line: spec.line,
    ir: spec.ir,
    specHash: spec.specHash,
    sourceHash: spec.sourceHash,
    documents: [...spec.documents],
  };
}

/**
 * Restores a spec from a snapshot and the text of its files (by path relative to the root, "" for the root).
 * Returns undefined for anything that is not an intact snapshot: the wrong format, a missing source file, or an
 * IR that no longer hashes to the recorded `specHash` (a damaged or tampered cache entry). The caller then
 * ingests again, so a bad entry can cost time but never changes a result.
 */
export function reviveSpec(snapshot: unknown, sources: ReadonlyMap<string, string>): IngestedSpec | undefined {
  if (!isJsonObject(snapshot)) return undefined;
  const value = snapshot as Partial<SpecSnapshot>;
  if (
    value.format !== SPEC_SNAPSHOT_FORMAT ||
    typeof value.file !== "string" ||
    typeof value.oasVersion !== "string" ||
    (value.line !== "3.0" && value.line !== "3.1") ||
    typeof value.specHash !== "string" ||
    typeof value.sourceHash !== "string" ||
    !Array.isArray(value.documents) ||
    value.ir === undefined
  ) {
    return undefined;
  }
  const documents: { relative: string; display: string; positions: PositionIndex }[] = [];
  for (const document of value.documents as Partial<SpecDocument>[]) {
    if (typeof document.relative !== "string" || typeof document.display !== "string") return undefined;
    const text = sources.get(document.relative);
    if (text === undefined) return undefined;
    documents.push({ relative: document.relative, display: document.display, positions: new PositionIndex(text) });
  }
  try {
    if (contentHash(value.ir) !== value.specHash) return undefined;
  } catch {
    return undefined;
  }
  return {
    file: value.file,
    oasVersion: value.oasVersion,
    line: value.line,
    ir: value.ir,
    specHash: value.specHash,
    sourceHash: value.sourceHash,
    locate: locator(documents),
    documents: documents.map(({ relative, display }) => ({ relative, display })),
    cached: true,
  };
}
