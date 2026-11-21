import type { Diagnostic } from "@drift/report-schema";
import { LineCounter, parseDocument } from "yaml";
import { isJsonObject, type JsonValue } from "../util/json.ts";
import { toPointer } from "../util/json-pointer.ts";
import type { IngestLimits } from "./types.ts";

export type ParseOutcome = { ok: true; value: JsonValue } | { ok: false; diagnostics: Diagnostic[] };

/**
 * Parses spec text as JSON or YAML 1.2 under resource limits.
 * JSON-looking text goes through `JSON.parse` (fast); anything else, and JSON that fails to parse,
 * goes through the YAML parser, which reports located errors. Never throws.
 */
export function parseSpecText(text: string, file: string, limits: IngestLimits): ParseOutcome {
  let value: unknown;
  const trimmed = text.trimStart();
  let parsedAsJson = false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      value = JSON.parse(text);
      parsedAsJson = true;
    } catch {
      // Fall through: the YAML parser reports the error with a position (JSON is YAML 1.2).
    }
  }
  if (!parsedAsJson) {
    const yaml = parseYaml(text, file, limits);
    if (!yaml.ok) return yaml;
    value = yaml.value;
  }
  const tooDeep = findTooDeep(value as JsonValue, limits.maxDepth);
  if (tooDeep) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "DEPTH_LIMIT",
          message: `Nesting deeper than ${limits.maxDepth} levels`,
          file,
          pointer: toPointer(tooDeep),
        },
      ],
    };
  }
  return { ok: true, value: value as JsonValue };
}

function parseYaml(text: string, file: string, limits: IngestLimits): ParseOutcome {
  const lines = new LineCounter();
  try {
    const doc = parseDocument(text, {
      lineCounter: lines,
      uniqueKeys: true,
      prettyErrors: false,
    });
    if (doc.errors.length > 0) {
      return {
        ok: false,
        diagnostics: doc.errors.map((error) => {
          const position = lines.linePos(error.pos[0]);
          return {
            severity: "error",
            code: error.code === "DUPLICATE_KEY" ? "DUPLICATE_KEY" : "SYNTAX_ERROR",
            message: firstLine(error.message),
            file,
            line: position.line,
            column: position.col,
          } satisfies Diagnostic;
        }),
      };
    }
    return { ok: true, value: doc.toJS({ maxAliasCount: limits.maxAliasCount }) as JsonValue };
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, diagnostics: [limitDiagnostic("DEPTH_LIMIT", "Nesting is too deep to parse", file)] };
    }
    if (error instanceof Error && /alias/i.test(error.message)) {
      return {
        ok: false,
        diagnostics: [limitDiagnostic("ALIAS_LIMIT", `More than ${limits.maxAliasCount} YAML alias expansions`, file)],
      };
    }
    throw error;
  }
}

function limitDiagnostic(code: "DEPTH_LIMIT" | "ALIAS_LIMIT", message: string, file: string): Diagnostic {
  return { severity: "error", code, message, file };
}

function firstLine(message: string): string {
  return message.split("\n", 1)[0] ?? message;
}

/**
 * Iterative depth check: no recursion, so a hostile document cannot overflow the stack here. Each entry
 * links to its parent instead of copying its path, so the cost stays linear in the size of the document.
 */
function findTooDeep(root: JsonValue, maxDepth: number): string[] | undefined {
  interface Entry {
    value: JsonValue;
    depth: number;
    key: string;
    parent: Entry | undefined;
  }
  const stack: Entry[] = [{ value: root, depth: 0, key: "", parent: undefined }];
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    if (entry.depth > maxDepth) {
      const path: string[] = [];
      for (let e = entry; e.parent; e = e.parent) path.unshift(e.key);
      return path;
    }
    const { value } = entry;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        stack.push({ value: item, depth: entry.depth + 1, key: String(index), parent: entry })
      );
    } else if (isJsonObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        stack.push({ value: item, depth: entry.depth + 1, key, parent: entry });
      }
    }
  }
  return undefined;
}
