import type { NormalizedSchema, SpecIR } from "../ingest/ir.ts";
import { getOwn, isJsonObject, type JsonValue } from "../util/json.ts";

/** Follows component references (a component can itself be a reference). */
export function resolveSchema(schema: NormalizedSchema | undefined, spec: SpecIR): NormalizedSchema | undefined {
  let current = schema;
  for (let hops = 0; current && hops < 32; hops++) {
    const ref = getOwn(current, "$ref");
    if (typeof ref !== "string") return current;
    current = spec.schemas[ref];
  }
  return current;
}

/** The JSON types a schema allows, or undefined when it does not say (any value). */
export function typesOf(schema: NormalizedSchema | undefined, spec: SpecIR): string[] | undefined {
  const resolved = resolveSchema(schema, spec);
  if (!resolved) return undefined;
  const type = getOwn(resolved, "type");
  if (Array.isArray(type)) return type.filter((item): item is string => typeof item === "string");
  const values =
    getOwn(resolved, "enum") ?? (getOwn(resolved, "const") === undefined ? undefined : [getOwn(resolved, "const")]);
  if (Array.isArray(values)) {
    return [
      ...new Set(values.map((value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value))),
    ];
  }
  return undefined;
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function scalarFromWire(text: string, types: string[] | undefined): JsonValue {
  if (types === undefined || types.includes("string")) return text;
  if ((types.includes("integer") || types.includes("number")) && NUMBER.test(text)) return Number(text);
  if (types.includes("boolean") && (text === "true" || text === "false")) return text === "true";
  if (types.includes("null") && (text === "" || text === "null")) return null;
  return text; // left as text: validation then reports the type mismatch
}

/**
 * Turns wire values (always text) into the JSON value a server following `schema` would see, before validation.
 * Arrays accept repeated keys (`?id=1&id=2`) and comma-separated values (`?id=1,2`). Each contract decodes with
 * its own schema, because each server parses the same bytes according to its own contract.
 */
export function fromWire(raw: readonly string[], schema: NormalizedSchema | undefined, spec: SpecIR): JsonValue {
  const types = typesOf(schema, spec);
  if (types?.includes("array")) {
    const resolved = resolveSchema(schema, spec);
    const items = resolved ? getOwn(resolved, "items") : undefined;
    const itemTypes = isJsonObject(items ?? null) ? typesOf(items as NormalizedSchema, spec) : undefined;
    const list = raw.length === 1 ? (raw[0] ?? "").split(",") : raw;
    return list.map((item) => scalarFromWire(item, itemTypes));
  }
  return scalarFromWire(raw[0] ?? "", types);
}

/** The wire form of a generated value, or undefined when it has none (objects need a serialisation style). */
export function toWire(value: JsonValue): string[] | undefined {
  if (value === null) return [""];
  if (Array.isArray(value)) {
    const items = value.map((item) => toWire(item));
    return items.every((item) => item?.length === 1) ? items.map((item) => item?.[0] ?? "") : undefined;
  }
  if (typeof value === "object") return undefined;
  return [String(value)];
}
