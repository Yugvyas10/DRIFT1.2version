import type { DiagnosticCode } from "@drift/report-schema";
import type { JsonValue } from "../util/json.ts";
import { getAtTokens, parsePointer, toPointer } from "../util/json-pointer.ts";
import type { DocumentSet, LoadedDocument } from "./documents.ts";

/** Where a value lives: a document and the reference tokens inside it. */
export interface Place {
  document: LoadedDocument;
  tokens: string[];
}

export interface ResolvedRef extends Place {
  /** Stable id of the target, in the same format as change locations (see `locationOf`). */
  id: string;
  value: JsonValue;
}

export type RefResolution = { ok: true; target: ResolvedRef } | { ok: false; code: DiagnosticCode; message: string };

/**
 * A location as used in change records and component ids: `#/pointer` in the root document,
 * `relative/file.yaml#/pointer` in a referenced file (relative to the root document's directory).
 */
export function locationOf(place: Place): string {
  return `${place.document.relative}#${toPointer(place.tokens)}`;
}

/** Resolves a `$ref` string found in `from`. Only files already loaded by `loadDocumentSet` are reachable. */
export function resolveRef(set: DocumentSet, from: LoadedDocument, ref: string): RefResolution {
  const hashIndex = ref.indexOf("#");
  const filePart = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : ref.slice(hashIndex + 1);

  let document = from;
  if (filePart !== "") {
    const path = set.fileRefs.get(`${from.path}\0${filePart}`);
    const loaded = path === undefined ? undefined : set.documents.get(path);
    if (!loaded)
      return { ok: false, code: "REF_NOT_FOUND", message: `$ref "${ref}" points to a file that was not loaded` };
    document = loaded;
  }

  const tokens = parsePointer(fragment, true);
  if (!tokens) {
    return {
      ok: false,
      code: "REF_UNSUPPORTED",
      message: `$ref "${ref}" uses a fragment that is not a JSON pointer (anchors are not supported)`,
    };
  }
  const found = getAtTokens(document.value, tokens);
  if (!found.found) return { ok: false, code: "REF_NOT_FOUND", message: `$ref "${ref}" points to nothing` };
  const place = { document, tokens };
  return { ok: true, target: { ...place, id: locationOf(place), value: found.value } };
}
