import type { Diagnostic } from "@drift/report-schema";
import { contentHash } from "../hash/content-hash.ts";
import { buildIR } from "./build-ir.ts";
import { loadDocumentSet } from "./documents.ts";
import type { SpecIR } from "./ir.ts";
import type { IngestOptions } from "./types.ts";
import { detectVersion, validateStructure, type OasLine } from "./validate.ts";

/** A spec that passed Ingest: its IR and the content hash that keys every later cache (ADR-0006). */
export interface IngestedSpec {
  /** Display path of the root file. */
  file: string;
  /** The `openapi` field, e.g. "3.0.3". */
  oasVersion: string;
  line: OasLine;
  ir: SpecIR;
  specHash: string;
  /**
   * Hash of every loaded document's parsed content, keyed by its path relative to the root: the input of the
   * Ingest stage (ADR-0006). Formatting and YAML-vs-JSON do not change it; any content change does.
   */
  sourceHash: string;
}

export interface IngestResult {
  /** Present only when there are no error diagnostics. */
  spec: IngestedSpec | undefined;
  /** Errors and warnings, sorted by file and position. */
  diagnostics: Diagnostic[];
}

/**
 * Stage 1 — Ingest (PLAN §4.1): load the root file and the local files it references, check the
 * OpenAPI version, validate the root document against the official schema, build the IR and hash it.
 * Never throws for bad input; every problem is a located diagnostic.
 */
export async function ingestSpec(entryPath: string, options: IngestOptions): Promise<IngestResult> {
  const loaded = await loadDocumentSet(entryPath, options);
  const diagnostics = [...loaded.diagnostics];
  const done = (spec?: IngestedSpec): IngestResult => ({ spec, diagnostics: sortDiagnostics(diagnostics) });
  if (!loaded.set) return done();

  const version = detectVersion(loaded.set.root);
  if (!version.ok) {
    diagnostics.push(version.diagnostic);
    return done();
  }
  diagnostics.push(...validateStructure(loaded.set.root, version.line));
  if (hasErrors(diagnostics)) return done();

  const built = buildIR(loaded.set, version.line, version.version);
  diagnostics.push(...built.diagnostics);
  if (hasErrors(diagnostics)) return done();

  return done({
    file: loaded.set.root.display,
    oasVersion: version.version,
    line: version.line,
    ir: built.ir,
    specHash: contentHash(built.ir),
    sourceHash: contentHash(
      Object.fromEntries([...loaded.set.documents.values()].map((document) => [document.relative, document.value]))
    ),
  });
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      // Located problems first, in source order; file-level ones (and "N more not shown") after them.
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message)
  );
}
