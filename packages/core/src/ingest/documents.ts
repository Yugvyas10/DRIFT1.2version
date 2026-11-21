import { posix } from "node:path";
import type { Diagnostic, DiagnosticCode } from "@drift/report-schema";
import { isJsonObject, type JsonValue } from "../util/json.ts";
import { toPointer } from "../util/json-pointer.ts";
import { parseSpecText } from "./parse.ts";
import { PositionIndex } from "./positions.ts";
import { DEFAULT_LIMITS, type IngestLimits, type IngestOptions, type SpecReader } from "./types.ts";

/** One parsed file of a spec. */
export interface LoadedDocument {
  /** Canonical absolute path. */
  path: string;
  /** Path shown in diagnostics. */
  display: string;
  /** Path relative to the root document's directory; "" for the root document itself. Used in locations. */
  relative: string;
  value: JsonValue;
  positions: PositionIndex;
}

/** The root document plus every local file it references, directly or indirectly. */
export interface DocumentSet {
  root: LoadedDocument;
  refRoot: string;
  documents: Map<string, LoadedDocument>;
  /** `${fromPath}\0${filePart}` → canonical path of the referenced file, for files that loaded. */
  fileRefs: Map<string, string>;
}

export interface LoadResult {
  set: DocumentSet | undefined;
  diagnostics: Diagnostic[];
}

const REMOTE_SCHEME = /^https?:/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Keys whose values are literal data, never contract structure: `$ref`s inside them are not followed. */
const DATA_KEYS = new Set(["example", "examples", "default", "enum", "const"]);
/** Maps whose keys are names chosen by the author, so a child named "example" is not the keyword. */
const NAMED_MAPS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "schemas",
  "parameters",
  "responses",
  "requestBodies",
  "headers",
  "securitySchemes",
  "links",
  "callbacks",
  "pathItems",
  "paths",
  "webhooks",
]);

/**
 * Loads the root spec and, breadth-first, every local file it references through `$ref`.
 * Remote references are never fetched (docs/SECURITY.md T7), and local references must stay inside
 * the ref root after symlinks are resolved. Never throws for bad input: problems become diagnostics.
 */
export async function loadDocumentSet(entryPath: string, options: IngestOptions): Promise<LoadResult> {
  const limits: IngestLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const display = options.displayPath ?? ((path: string) => path);
  const { reader } = options;
  const diagnostics: Diagnostic[] = [];

  const entry = await tryRealpath(reader, entryPath);
  if (!entry) {
    diagnostics.push(fileDiagnostic("FILE_READ_ERROR", `Cannot read ${display(entryPath)}`, display(entryPath)));
    return { set: undefined, diagnostics };
  }
  const refRoot = await tryRealpath(reader, options.refRoot ?? posix.dirname(entry));
  if (!refRoot) {
    const root = options.refRoot ?? posix.dirname(entry);
    diagnostics.push(fileDiagnostic("FILE_READ_ERROR", `Cannot read the ref root ${display(root)}`, display(root)));
    return { set: undefined, diagnostics };
  }
  if (!isInside(entry, refRoot)) {
    diagnostics.push(
      fileDiagnostic("REF_OUTSIDE_ROOT", `The spec is outside the ref root ${display(refRoot)}`, display(entry))
    );
    return { set: undefined, diagnostics };
  }

  const rootDir = posix.dirname(entry);
  const documents = new Map<string, LoadedDocument>();
  const fileRefs = new Map<string, string>();
  const queue: string[] = [entry];
  const queued = new Set<string>(queue);
  let totalBytes = 0;

  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    const shown = display(path);
    if (documents.size >= limits.maxFiles) {
      diagnostics.push(
        fileDiagnostic("TOO_MANY_FILES", `A spec may reference at most ${limits.maxFiles} files`, shown)
      );
      break;
    }
    const loaded = await readWithinLimits(reader, path, shown, limits, totalBytes);
    if (!loaded.ok) {
      diagnostics.push(loaded.diagnostic);
      if (path === entry) return { set: undefined, diagnostics };
      continue;
    }
    totalBytes += loaded.bytes;
    const parsed = parseSpecText(loaded.text, shown, limits);
    if (!parsed.ok) {
      diagnostics.push(...parsed.diagnostics);
      if (path === entry) return { set: undefined, diagnostics };
      continue;
    }
    const document: LoadedDocument = {
      path,
      display: shown,
      relative: path === entry ? "" : posix.relative(rootDir, path),
      value: parsed.value,
      positions: new PositionIndex(loaded.text),
    };
    documents.set(path, document);

    for (const ref of collectRefs(parsed.value)) {
      const target = await classifyRef(reader, document, ref.value, refRoot);
      if (target.kind === "internal") continue;
      if (target.kind === "problem") {
        diagnostics.push(refDiagnostic(document, ref.tokens, target.code, target.message));
        continue;
      }
      fileRefs.set(`${path}\0${target.filePart}`, target.path);
      if (!queued.has(target.path)) {
        queued.add(target.path);
        queue.push(target.path);
      }
    }
  }

  const root = documents.get(entry);
  if (!root) return { set: undefined, diagnostics };
  return { set: { root, refRoot, documents, fileRefs }, diagnostics };
}

type RefTarget =
  | { kind: "internal" }
  | { kind: "file"; filePart: string; path: string }
  | { kind: "problem"; code: DiagnosticCode; message: string };

async function classifyRef(reader: SpecReader, from: LoadedDocument, ref: string, refRoot: string): Promise<RefTarget> {
  if (ref.startsWith("#")) return { kind: "internal" };
  if (REMOTE_SCHEME.test(ref)) {
    return {
      kind: "problem",
      code: "REF_REMOTE_DISALLOWED",
      message: `Remote $ref "${ref}" is not fetched: remote references are disabled (docs/SECURITY.md T7)`,
    };
  }
  if (ANY_SCHEME.test(ref)) {
    return {
      kind: "problem",
      code: "REF_UNSUPPORTED",
      message: `Unsupported $ref "${ref}": only local files and #/ pointers`,
    };
  }
  const filePart = ref.split("#", 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(filePart);
  } catch {
    return { kind: "problem", code: "REF_NOT_FOUND", message: `Malformed $ref "${ref}"` };
  }
  const resolved = await tryRealpath(reader, posix.resolve(posix.dirname(from.path), decoded));
  if (!resolved) return { kind: "problem", code: "REF_NOT_FOUND", message: `$ref "${ref}" points to a missing file` };
  if (!isInside(resolved, refRoot)) {
    return {
      kind: "problem",
      code: "REF_OUTSIDE_ROOT",
      message: `$ref "${ref}" leaves the ref root; local references must stay inside it`,
    };
  }
  return { kind: "file", filePart, path: resolved };
}

/** Every `$ref` string in a document, with its location, skipping literal data such as examples and x- extensions. */
export function collectRefs(root: JsonValue): { value: string; tokens: string[] }[] {
  const found: { value: string; tokens: string[] }[] = [];
  const stack: { value: JsonValue; tokens: string[]; inNamedMap: boolean }[] = [
    { value: root, tokens: [], inNamedMap: false },
  ];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    const { value, tokens, inNamedMap } = entry;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        stack.push({ value: item, tokens: [...tokens, String(index)], inNamedMap: false })
      );
      continue;
    }
    if (!isJsonObject(value)) continue;
    for (const [key, item] of Object.entries(value)) {
      if (!inNamedMap) {
        if (key === "$ref" && typeof item === "string") {
          found.push({ value: item, tokens: [...tokens, key] });
          continue;
        }
        if (DATA_KEYS.has(key) || key.startsWith("x-")) continue;
      }
      stack.push({ value: item, tokens: [...tokens, key], inNamedMap: !inNamedMap && NAMED_MAPS.has(key) });
    }
  }
  return found;
}

type ReadOutcome = { ok: true; text: string; bytes: number } | { ok: false; diagnostic: Diagnostic };

async function readWithinLimits(
  reader: SpecReader,
  path: string,
  shown: string,
  limits: IngestLimits,
  totalSoFar: number
): Promise<ReadOutcome> {
  let bytes: number;
  try {
    bytes = await reader.size(path);
  } catch {
    return { ok: false, diagnostic: fileDiagnostic("FILE_READ_ERROR", `Cannot read ${shown}`, shown) };
  }
  if (bytes > limits.maxFileBytes) {
    return {
      ok: false,
      diagnostic: fileDiagnostic(
        "FILE_TOO_LARGE",
        `File is ${bytes} bytes; the limit is ${limits.maxFileBytes}`,
        shown
      ),
    };
  }
  if (totalSoFar + bytes > limits.maxTotalBytes) {
    return {
      ok: false,
      diagnostic: fileDiagnostic(
        "FILE_TOO_LARGE",
        `The spec's files exceed ${limits.maxTotalBytes} bytes in total`,
        shown
      ),
    };
  }
  try {
    return { ok: true, text: await reader.readText(path), bytes };
  } catch {
    return { ok: false, diagnostic: fileDiagnostic("FILE_READ_ERROR", `Cannot read ${shown}`, shown) };
  }
}

async function tryRealpath(reader: SpecReader, path: string): Promise<string | undefined> {
  try {
    return await reader.realpath(path);
  } catch {
    return undefined;
  }
}

/** True when `path` is `root` itself or below it. */
export function isInside(path: string, root: string): boolean {
  const relative = posix.relative(root, path);
  return relative === "" || (!relative.startsWith("..") && !posix.isAbsolute(relative));
}

function fileDiagnostic(code: DiagnosticCode, message: string, file: string): Diagnostic {
  return { severity: "error", code, message, file };
}

export function refDiagnostic(
  document: LoadedDocument,
  tokens: readonly string[],
  code: DiagnosticCode,
  message: string,
  severity: Diagnostic["severity"] = "error"
): Diagnostic {
  const position = document.positions.locate(tokens);
  return {
    severity,
    code,
    message,
    file: document.display,
    pointer: toPointer(tokens),
    ...(position ? { line: position.line, column: position.column } : {}),
  };
}
