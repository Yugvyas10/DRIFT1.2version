import type { Diagnostic } from "@drift/report-schema";

/**
 * How Ingest reads files. The engine never touches the file system itself (PLAN §3.2): the CLI passes
 * a file-system reader, tests pass an in-memory one, and the worker (M6) will pass one over object storage.
 * Paths are absolute POSIX paths.
 */
export interface SpecReader {
  /** Size in bytes, checked before reading so an oversize file is never loaded into memory. */
  size(path: string): Promise<number>;
  readText(path: string): Promise<string>;
  /** Canonical absolute path with symlinks resolved; used to keep `$ref`s inside the ref root. */
  realpath(path: string): Promise<string>;
}

/** Resource limits for untrusted specs (docs/SECURITY.md T8). */
export interface IngestLimits {
  /** Largest single file, in bytes. */
  maxFileBytes: number;
  /** Largest total across the root file and every referenced file, in bytes. */
  maxTotalBytes: number;
  /** Most files a spec may pull in through `$ref`, the root file included. */
  maxFiles: number;
  /** Most YAML aliases a file may expand (alias-bomb protection). */
  maxAliasCount: number;
  /** Deepest nesting of objects and arrays. */
  maxDepth: number;
}

export const DEFAULT_LIMITS: IngestLimits = {
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxFiles: 500,
  maxAliasCount: 100,
  maxDepth: 256,
};

export interface IngestOptions {
  reader: SpecReader;
  /** Directory that local `$ref`s must stay inside. Defaults to the root spec's directory. */
  refRoot?: string;
  limits?: Partial<IngestLimits>;
  /** Turns an absolute path into the path shown in diagnostics. Defaults to the absolute path. */
  displayPath?: (absolutePath: string) => string;
}

export type IngestDiagnostic = Diagnostic;
