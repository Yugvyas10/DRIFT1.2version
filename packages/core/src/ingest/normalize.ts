import type { Diagnostic } from "@drift/report-schema";
import { getOwn, isJsonObject, type JsonObject, type JsonValue } from "../util/json.ts";
import { schemaFingerprint } from "../util/schema.ts";
import { refDiagnostic, type DocumentSet } from "./documents.ts";
import type { NormalizedSchema } from "./ir.ts";
import { locationOf, resolveRef, type Place, type ResolvedRef } from "./refs.ts";
import type { OasLine } from "./validate.ts";

/** Keywords copied as they are. `enum`, `const` and `default` hold data and are copied verbatim. */
const COPIED_KEYWORDS = [
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "multipleOf",
  "enum",
  "const",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "title",
  "description",
] as const;

/** Keywords allowed alongside a 3.1 `$ref` without turning it into an `allOf`. */
const REF_ANNOTATIONS = new Set(["$ref", "description", "summary", "$comment"]);

/** A schema can be folded into an `allOf` merge only if it uses nothing but these keywords. */
const MERGEABLE = new Set(["$source", "type", "properties", "required", "title", "description", "deprecated"]);

export function child(place: Place, ...tokens: string[]): Place {
  return { document: place.document, tokens: [...place.tokens, ...tokens] };
}

/**
 * Turns OpenAPI Schema Objects (3.0 or 3.1) into one normalised JSON Schema form (PLAN §4.1):
 * - `type` is always a sorted array; 3.0 `nullable: true` adds "null" to it;
 * - 3.0 boolean `exclusiveMinimum`/`exclusiveMaximum` become the numeric 2020-12 form;
 * - `allOf` is merged when that is provably safe (object members, no conflicting properties);
 *   otherwise it is kept as is;
 * - `oneOf`, `anyOf`, `not` and `discriminator` are kept; discriminator mappings point to component ids;
 * - examples, `x-` extensions and keywords DRIFT does not compare are dropped;
 * - references to components stay references (`{ "$ref": id }`), normalised once each, so cycles never expand.
 */
export class SchemaNormalizer {
  readonly schemas: Record<string, NormalizedSchema> = {};
  readonly #set: DocumentSet;
  readonly #line: OasLine;
  readonly #report: (diagnostic: Diagnostic) => void;
  readonly #targets = new Map<string, ResolvedRef>();
  readonly #state = new Map<string, "queued" | "in-progress" | "done">();
  readonly #queue: string[] = [];

  constructor(set: DocumentSet, line: OasLine, report: (diagnostic: Diagnostic) => void) {
    this.#set = set;
    this.#line = line;
    this.#report = report;
  }

  normalize(raw: JsonValue, place: Place): NormalizedSchema {
    const source = locationOf(place);
    if (raw === true) return { $source: source };
    if (raw === false) return { not: {}, $source: source };
    if (!isJsonObject(raw)) return { $source: source };
    const ref = getOwn(raw, "$ref");
    if (typeof ref === "string") return this.#reference(raw, ref, place, source);
    return this.#object(raw, place, source);
  }

  /** Normalises every component referenced so far, including those referenced while doing so. */
  drain(): void {
    for (let id = this.#queue.shift(); id !== undefined; id = this.#queue.shift()) {
      if (this.#state.get(id) === "queued") this.#normalizeComponent(id);
    }
  }

  #reference(raw: JsonObject, ref: string, place: Place, source: string): NormalizedSchema {
    const resolution = resolveRef(this.#set, place.document, ref);
    if (!resolution.ok) {
      this.#report(refDiagnostic(place.document, [...place.tokens, "$ref"], resolution.code, resolution.message));
      return { $source: source };
    }
    const node: NormalizedSchema = { $ref: this.#request(resolution.target), $source: source };
    if (this.#line === "3.1") {
      // In 3.1 a $ref applies alongside its sibling keywords, which is what allOf means.
      const siblings = Object.fromEntries(Object.entries(raw).filter(([key]) => !REF_ANNOTATIONS.has(key)));
      if (Object.keys(siblings).length > 0) {
        return this.#mergeAllOf({ allOf: [node, this.#object(siblings, place, source)], $source: source });
      }
    }
    // In 3.0, siblings of $ref are ignored by the specification.
    return node;
  }

  #object(raw: JsonObject, place: Place, source: string): NormalizedSchema {
    const out: NormalizedSchema = { $source: source };

    const type = getOwn(raw, "type");
    let types: string[] | undefined;
    if (typeof type === "string") types = [type];
    else if (Array.isArray(type)) types = type.filter((item): item is string => typeof item === "string");
    if (types && this.#line === "3.0" && getOwn(raw, "nullable") === true) types.push("null");
    if (types) out.type = [...new Set(types)].sort();

    normalizeBounds(raw, out);
    for (const keyword of COPIED_KEYWORDS) {
      const value = getOwn(raw, keyword);
      if (value !== undefined) out[keyword] = value;
    }

    const required = getOwn(raw, "required");
    if (Array.isArray(required)) {
      out.required = [...new Set(required.filter((name): name is string => typeof name === "string"))].sort();
    }
    const properties = getOwn(raw, "properties");
    if (isJsonObject(properties)) {
      const normalized: JsonObject = {};
      for (const [name, schema] of Object.entries(properties)) {
        normalized[name] = this.normalize(schema, child(place, "properties", name));
      }
      out.properties = normalized;
    }
    const additional = getOwn(raw, "additionalProperties");
    if (typeof additional === "boolean") out.additionalProperties = additional;
    else if (additional !== undefined)
      out.additionalProperties = this.normalize(additional, child(place, "additionalProperties"));

    const items = getOwn(raw, "items");
    if (items !== undefined) out.items = this.normalize(items, child(place, "items"));
    const prefixItems = getOwn(raw, "prefixItems");
    if (Array.isArray(prefixItems)) {
      out.prefixItems = prefixItems.map((schema, index) =>
        this.normalize(schema, child(place, "prefixItems", String(index)))
      );
    }
    for (const keyword of ["allOf", "oneOf", "anyOf"] as const) {
      const list = getOwn(raw, keyword);
      if (Array.isArray(list)) {
        out[keyword] = list.map((schema, index) => this.normalize(schema, child(place, keyword, String(index))));
      }
    }
    const not = getOwn(raw, "not");
    if (not !== undefined) out.not = this.normalize(not, child(place, "not"));

    const discriminator = getOwn(raw, "discriminator");
    if (isJsonObject(discriminator)) out.discriminator = this.#discriminator(discriminator, place);

    return out.allOf ? this.#mergeAllOf(out) : out;
  }

  #discriminator(raw: JsonObject, place: Place): JsonObject {
    const out: JsonObject = {};
    const propertyName = getOwn(raw, "propertyName");
    if (typeof propertyName === "string") out.propertyName = propertyName;
    const mapping = getOwn(raw, "mapping");
    if (isJsonObject(mapping)) {
      const resolved: JsonObject = {};
      for (const [value, target] of Object.entries(mapping)) {
        if (typeof target !== "string") continue;
        // A mapping value is either a $ref or a bare component name (OpenAPI 3.x §4.8.25).
        const ref = target.includes("#") || target.includes("/") ? target : `#/components/schemas/${target}`;
        const resolution = resolveRef(this.#set, place.document, ref);
        resolved[value] = resolution.ok ? this.#request(resolution.target) : target;
      }
      out.mapping = resolved;
    }
    return out;
  }

  /** Records a component for normalisation and returns its id. */
  #request(target: ResolvedRef): string {
    if (!this.#state.has(target.id)) {
      this.#state.set(target.id, "queued");
      this.#targets.set(target.id, target);
      this.#queue.push(target.id);
    }
    return target.id;
  }

  #normalizeComponent(id: string): NormalizedSchema | undefined {
    const target = this.#targets.get(id);
    if (!target) return undefined;
    this.#state.set(id, "in-progress");
    const schema = this.normalize(target.value, target);
    this.schemas[id] = schema;
    this.#state.set(id, "done");
    return schema;
  }

  /** The normalised component now, or undefined while it is still being normalised (a cycle). */
  #componentNow(id: string): NormalizedSchema | undefined {
    const state = this.#state.get(id);
    if (state === "done") return this.schemas[id];
    if (state === "queued") return this.#normalizeComponent(id);
    return undefined;
  }

  /**
   * Folds `allOf` into one schema when every member (after following component references) uses only
   * object-shaping keywords and no property is defined differently by two members. Otherwise the schema
   * is returned unchanged, so a merge can never change what the schema accepts.
   */
  #mergeAllOf(schema: NormalizedSchema): NormalizedSchema {
    const members = schema.allOf;
    if (!Array.isArray(members)) return schema;
    const outer = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "allOf"));
    const parts: JsonObject[] = [outer];
    for (const member of members) {
      if (!isJsonObject(member)) return schema;
      const ref = getOwn(member, "$ref");
      const resolved = typeof ref === "string" ? this.#componentNow(ref) : member;
      if (!resolved) return schema;
      parts.push(resolved);
    }
    if (!parts.every((part) => Object.keys(part).every((key) => MERGEABLE.has(key)))) return schema;

    const merged: NormalizedSchema = { $source: schema.$source ?? null };
    let types: Set<string> | undefined;
    const properties: JsonObject = {};
    const required = new Set<string>();
    for (const part of parts) {
      const partTypes = getOwn(part, "type");
      if (Array.isArray(partTypes)) {
        const next = new Set(partTypes.filter((item): item is string => typeof item === "string"));
        types = types ? intersectTypes(types, next) : next;
        if (types.size === 0) return schema;
      }
      const partProperties = getOwn(part, "properties");
      if (isJsonObject(partProperties)) {
        for (const [name, property] of Object.entries(partProperties)) {
          const existing = getOwn(properties, name);
          if (existing !== undefined && schemaFingerprint(existing) !== schemaFingerprint(property)) return schema;
          properties[name] ??= property;
        }
      }
      const partRequired = getOwn(part, "required");
      if (Array.isArray(partRequired)) partRequired.forEach((name) => typeof name === "string" && required.add(name));
      for (const keyword of ["title", "description"] as const) {
        const value = getOwn(part, keyword);
        if (value !== undefined && merged[keyword] === undefined) merged[keyword] = value;
      }
      if (getOwn(part, "deprecated") === true) merged.deprecated = true;
    }
    if (types) merged.type = [...types].sort();
    if (Object.keys(properties).length > 0) merged.properties = properties;
    if (required.size > 0) merged.required = [...required].sort();
    return merged;
  }
}

/** Type intersection where "integer" is a subset of "number". */
function intersectTypes(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const type of a) {
    if (b.has(type)) result.add(type);
    else if (type === "integer" && b.has("number")) result.add("integer");
  }
  for (const type of b) if (type === "integer" && a.has("number")) result.add("integer");
  return result;
}

function normalizeBounds(raw: JsonObject, out: NormalizedSchema): void {
  for (const [boundKey, exclusiveKey] of [
    ["minimum", "exclusiveMinimum"],
    ["maximum", "exclusiveMaximum"],
  ] as const) {
    const bound = getOwn(raw, boundKey);
    const exclusive = getOwn(raw, exclusiveKey);
    if (typeof exclusive === "boolean") {
      // OpenAPI 3.0 form: `exclusiveMinimum: true` modifies `minimum`.
      if (typeof bound === "number") out[exclusive ? exclusiveKey : boundKey] = bound;
    } else {
      if (typeof bound === "number") out[boundKey] = bound;
      if (typeof exclusive === "number") out[exclusiveKey] = exclusive;
    }
  }
}
