import type { Diagnostic } from "@drift/report-schema";
import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import AjvDraft04 from "ajv-draft-04";
import addFormats from "ajv-formats";
import { getOwn, isJsonObject, type JsonValue } from "../util/json.ts";
import { parsePointer } from "../util/json-pointer.ts";
import { refDiagnostic, type LoadedDocument } from "./documents.ts";
import oas30Schema from "./oas-schemas/oas-3.0-2021-09-28.json" with { type: "json" };
import oas31Schema from "./oas-schemas/oas-3.1-2022-10-07.json" with { type: "json" };

export type OasLine = "3.0" | "3.1";

export type VersionOutcome = { ok: true; line: OasLine; version: string } | { ok: false; diagnostic: Diagnostic };

/** Reads the `openapi` field. OpenAPI 3.0.x and 3.1.x are supported; Swagger 2.0 and 3.2 are not (yet). */
export function detectVersion(document: LoadedDocument): VersionOutcome {
  const { value } = document;
  const fail = (code: "NOT_AN_OBJECT" | "UNSUPPORTED_VERSION", message: string, tokens: string[] = []) =>
    ({ ok: false, diagnostic: refDiagnostic(document, tokens, code, message) }) as const;
  if (!isJsonObject(value)) return fail("NOT_AN_OBJECT", "An OpenAPI document must be an object");
  if (getOwn(value, "swagger") !== undefined) {
    return fail("UNSUPPORTED_VERSION", "Swagger 2.0 is not supported; convert the document to OpenAPI 3.x", [
      "swagger",
    ]);
  }
  const version = getOwn(value, "openapi");
  if (typeof version !== "string") return fail("UNSUPPORTED_VERSION", 'Missing "openapi" version field');
  if (/^3\.0\.\d+(-.+)?$/.test(version)) return { ok: true, line: "3.0", version };
  if (/^3\.1\.\d+(-.+)?$/.test(version)) return { ok: true, line: "3.1", version };
  return fail("UNSUPPORTED_VERSION", `OpenAPI ${version} is not supported; DRIFT reads 3.0.x and 3.1.x`, ["openapi"]);
}

/** Most schema problems reported per document; the rest are summarised in one line. */
const MAX_REPORTED = 25;

/** Validates a root document against the official OpenAPI JSON Schema and returns located diagnostics. */
export function validateStructure(document: LoadedDocument, line: OasLine): Diagnostic[] {
  const validate = validatorFor(line);
  if (validate(document.value)) return [];
  const problems = condense(validate.errors ?? [], document.value);
  const diagnostics = problems
    .slice(0, MAX_REPORTED)
    .map((problem) => refDiagnostic(document, problem.tokens, "OAS_SCHEMA", problem.message));
  if (problems.length > MAX_REPORTED) {
    diagnostics.push({
      severity: "error",
      code: "OAS_SCHEMA",
      message: `${problems.length - MAX_REPORTED} more schema problems not shown`,
      file: document.display,
    });
  }
  return diagnostics;
}

const validators = new Map<OasLine, ValidateFunction>();

function validatorFor(line: OasLine): ValidateFunction {
  let validate = validators.get(line);
  if (!validate) {
    if (line === "3.0") {
      // ajv-draft-04 and ajv-formats are CommonJS; `.default` is their class/function in both TS and Node.
      const ajv = new AjvDraft04.default({ allErrors: true, strict: false, logger: false });
      addFormats.default(ajv);
      validate = ajv.compile(oas30Schema);
    } else {
      const ajv = new Ajv2020({ allErrors: true, strict: false, logger: false });
      addFormats.default(ajv);
      ajv.addFormat("media-range", true);
      validate = ajv.compile(withoutDynamicMetaRef(oas31Schema) as AnySchema);
    }
    validators.set(line, validate);
  }
  return validate;
}

/**
 * Replaces `{"$dynamicRef": "#meta"}` with the equivalent `{"$ref": "#/$defs/schema"}`.
 * Works around Ajv 8 applying the parent's `unevaluatedProperties` to dynamically referenced Schema
 * Objects; see oas-schemas/README.md for why the two are equivalent in this schema.
 */
export function withoutDynamicMetaRef(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutDynamicMetaRef);
  if (!isJsonObject(schema)) return schema;
  if (getOwn(schema, "$dynamicRef") === "#meta") {
    const rest = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$dynamicRef"));
    return { ...rest, $ref: "#/$defs/schema" };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, withoutDynamicMetaRef(value)]));
}

interface Problem {
  tokens: string[];
  message: string;
}

/**
 * Turns Ajv's raw errors into a short, readable list. With `oneOf: [X, Reference]` everywhere in the
 * OpenAPI schema, one mistake produces errors from every branch; we drop the container errors (oneOf,
 * anyOf, if) and the Reference branch's "missing $ref" when more specific errors exist, then deduplicate.
 */
export function condense(errors: readonly ErrorObject[], root: JsonValue): Problem[] {
  const specific = errors.filter((error) => !["oneOf", "anyOf", "if", "not"].includes(error.keyword));
  const pool = specific.length > 0 ? specific : [...errors];
  const withoutRefBranch = pool.filter((error) => !(isMissing(error, "$ref") && hasSiblingError(error, pool)));
  const seen = new Set<string>();
  const problems: Problem[] = [];
  for (const error of withoutRefBranch) {
    const problem = describe(error, root);
    const key = `${problem.tokens.join("/")}\0${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push(problem);
  }
  return problems;
}

function isMissing(error: ErrorObject, property: string): boolean {
  return error.keyword === "required" && (error.params as { missingProperty?: string }).missingProperty === property;
}

function hasSiblingError(error: ErrorObject, all: readonly ErrorObject[]): boolean {
  return all.some(
    (other) =>
      other !== error &&
      !isMissing(other, "$ref") &&
      (other.instancePath === error.instancePath || other.instancePath.startsWith(`${error.instancePath}/`))
  );
}

function describe(error: ErrorObject, root: JsonValue): Problem {
  const tokens = parsePointer(error.instancePath) ?? [];
  const params = error.params as Record<string, unknown>;
  const at = (extra: unknown) => (typeof extra === "string" ? [...tokens, extra] : tokens);
  switch (error.keyword) {
    case "required":
      return { tokens, message: `Missing required property "${String(params.missingProperty)}"` };
    case "additionalProperties":
      return {
        tokens: at(params.additionalProperty),
        message: `Unexpected property "${String(params.additionalProperty)}"`,
      };
    case "unevaluatedProperties":
      return {
        tokens: at(params.unevaluatedProperty),
        message: `Unexpected property "${String(params.unevaluatedProperty)}"`,
      };
    case "type":
      return { tokens, message: `Must be of type ${String(params.type)}${describeActual(root, tokens)}` };
    case "enum":
      return {
        tokens,
        message: `Must be one of ${(params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`,
      };
    case "format":
      return { tokens, message: `Must be a valid ${String(params.format)}` };
    case "pattern":
      return { tokens, message: `Must match the pattern ${String(params.pattern)}` };
    default:
      return { tokens, message: capitalise(error.message ?? `Fails the "${error.keyword}" rule`) };
  }
}

function describeActual(root: JsonValue, tokens: string[]): string {
  let current: JsonValue | undefined = root;
  for (const token of tokens) {
    current = Array.isArray(current)
      ? current[Number(token)]
      : isJsonObject(current)
        ? getOwn(current, token)
        : undefined;
  }
  if (current === undefined) return "";
  return `, found ${current === null ? "null" : Array.isArray(current) ? "array" : typeof current}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
