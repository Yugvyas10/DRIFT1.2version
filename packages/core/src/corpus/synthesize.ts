import type { Direction } from "@drift/report-schema";
import { canonicalJson } from "../hash/canonical-json.ts";
import type { NormalizedSchema, OperationIR, SpecIR } from "../ingest/ir.ts";
import { getOwn, isJsonObject, type JsonObject, type JsonValue } from "../util/json.ts";
import { resolveSchema, toWire } from "../verify/wire.ts";
import { stringMatching } from "./pattern.ts";
import { isJsonMediaType, type RoutedSample } from "./sample.ts";

/**
 * Deterministic synthetic samples (PLAN §4.3). There is no randomness: every schema node offers a short list of
 * variants (each enum value, the lower and upper bound, all properties or only the required ones, each oneOf
 * branch…), and a plan picks one variant per node. Plans are built so that
 *
 * 1. the nodes a change touches ("focus points") take every one of their variants, and
 * 2. every node takes every variant at least once (a sweep),
 *
 * which makes the samples change-directed without per-change code: for a removed enum value the old schema's
 * node offers that value; for a tightened bound it offers the old bound. Every sample is then validated against
 * the contract it was generated from, and discarded if that contract rejects it, so generator shortcuts can
 * never produce false evidence.
 */

export interface ChoicePlan {
  /** Picks one of `choices` (≥ 1) variants for the node or decision identified by `point`. */
  pick(point: string, choices: number): number;
}

type Strategy = (point: string, choices: number) => number;

/** A plan that also records which points it met and how many variants each had. */
export class RecordingPlan implements ChoicePlan {
  readonly seen = new Map<string, { choices: number; picked: number }>();
  readonly #strategy: Strategy;

  constructor(strategy: Strategy) {
    this.#strategy = strategy;
  }

  pick(point: string, choices: number): number {
    const picked = Math.min(choices - 1, Math.max(0, this.#strategy(point, choices)));
    if (!this.seen.has(point)) this.seen.set(point, { choices, picked });
    return picked;
  }
}

export const FAIL: unique symbol = Symbol("cannot generate");
export type Generated = JsonValue | typeof FAIL;

const FORMAT_VALUES: Record<string, string> = {
  date: "2026-01-15",
  "date-time": "2026-01-15T10:00:00Z",
  time: "10:00:00Z",
  duration: "P1D",
  email: "user@example.com",
  "idn-email": "user@example.com",
  hostname: "example.com",
  "idn-hostname": "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
  uri: "https://example.com/drift",
  url: "https://example.com/drift",
  "uri-reference": "/drift",
  iri: "https://example.com/drift",
  "iri-reference": "/drift",
  "uri-template": "https://example.com/{id}",
  uuid: "123e4567-e89b-42d3-a456-426614174000",
  "json-pointer": "/drift",
  "relative-json-pointer": "0/drift",
  regex: "^drift$",
  byte: "ZHJpZnQ=",
  binary: "drift",
  password: "drift-password",
};
const PATTERN_CANDIDATES = ["drift", "a", "A", "0", "1", "abc", "ABC", "a1", "A1", "2026-01-15", "drift-1", "x_1"];

const MAX_DEPTH = 24;
const SHALLOW_DEPTH = 8;
const MAX_ITEMS = 64;

type Variant =
  | { kind: "value"; value: JsonValue }
  | { kind: "branch"; keyword: "oneOf" | "anyOf"; index: number }
  | { kind: "number"; integer: boolean; which: "typical" | "low" | "high" }
  | { kind: "string"; which: "typical" | "short" | "long" }
  | { kind: "array"; which: "typical" | "few" | "many" }
  | { kind: "object"; which: "all" | "required" | "extra" }
  | { kind: "any" };

function num(node: JsonObject, keyword: string): number | undefined {
  const value = getOwn(node, keyword);
  return typeof value === "number" ? value : undefined;
}

function list(node: JsonObject, keyword: string): JsonObject[] | undefined {
  const value = getOwn(node, keyword);
  return Array.isArray(value) ? value.filter(isJsonObject) : undefined;
}

export function sourceOf(node: JsonObject): string {
  const source = getOwn(node, "$source");
  return typeof source === "string" ? source : "#";
}

/** Generates JSON values from normalised schemas of one contract, in one direction. */
export class SchemaGenerator {
  readonly #spec: SpecIR;
  readonly #direction: Direction;
  readonly #plan: ChoicePlan;

  constructor(spec: SpecIR, direction: Direction, plan: ChoicePlan) {
    this.#spec = spec;
    this.#direction = direction;
    this.#plan = plan;
  }

  generate(schema: NormalizedSchema | null | undefined): Generated {
    return schema ? this.#value(schema, 0) : "drift";
  }

  /**
   * Directions towards `targets` (schema sources): for each decision on a way from `schema` to a target, the first
   * variant that leads there. A plan that follows them reaches every reachable target within SHALLOW_DEPTH,
   * where a plan that picks the first variant everywhere may never get there (for example when the way passes
   * through the second branch of an anyOf, as with Stripe's expandable fields). Computed on the schema graph, so
   * recursive schemas are handled.
   */
  routes(schema: NormalizedSchema | null | undefined, targets: ReadonlySet<string>): Map<string, number> {
    const nodes = new Map<string, { variants: string[][]; always: string[] }>();
    const parents = new Map<string, Set<string>>();
    const queue: JsonObject[] = schema ? [schema] : [];
    const pointOf = (child: JsonObject): string | undefined => {
      const node = resolveSchema(child, this.#spec);
      return node ? sourceOf(node) : undefined;
    };
    while (queue.length > 0) {
      const next = queue.pop();
      const node = next ? resolveSchema(next, this.#spec) : undefined;
      if (!node) continue;
      const point = sourceOf(node);
      if (nodes.has(point)) continue;
      const edges = (children: JsonObject[]) => {
        const points: string[] = [];
        for (const child of children) {
          const target = pointOf(child);
          if (target === undefined) continue;
          points.push(target);
          const set = parents.get(target) ?? new Set<string>();
          set.add(point);
          parents.set(target, set);
          queue.push(child);
        }
        return points;
      };
      nodes.set(point, {
        variants: this.#variants(node).map((variant) => edges(this.#children(node, variant))),
        always: edges(list(node, "allOf") ?? []),
      });
    }
    // Every node from which a target can be reached, walking the parent edges back from the targets.
    const reaching = new Set([...targets].filter((target) => nodes.has(target)));
    const walk = [...reaching];
    while (walk.length > 0) {
      for (const parent of parents.get(walk.pop() ?? "") ?? []) {
        if (reaching.has(parent)) continue;
        reaching.add(parent);
        walk.push(parent);
      }
    }
    const out = new Map<string, number>();
    for (const point of reaching) {
      const node = nodes.get(point);
      if (!node || targets.has(point) || node.always.some((child) => reaching.has(child))) continue;
      const index = node.variants.findIndex((children) => children.some((child) => reaching.has(child)));
      if (index >= 0) out.set(point, index);
    }
    return out;
  }

  /** The subschemas `variant` of `node` generates values for (allOf members apart). */
  #children(node: JsonObject, variant: Variant): JsonObject[] {
    const properties = (which: "all" | "required"): JsonObject[] => {
      const props = getOwn(node, "properties");
      if (!isJsonObject(props ?? null)) return [];
      const requiredList = getOwn(node, "required");
      const required = new Set(Array.isArray(requiredList) ? requiredList : []);
      const hidden = this.#direction === "request" ? "readOnly" : "writeOnly";
      return Object.entries(props as JsonObject)
        .filter(([name, schema]) => (which === "all" || required.has(name)) && isJsonObject(schema ?? null))
        .map(([, schema]) => schema as JsonObject)
        .filter((schema) => getOwn(resolveSchema(schema, this.#spec) ?? {}, hidden) !== true);
    };
    switch (variant.kind) {
      case "branch": {
        const branch = list(node, variant.keyword)?.[variant.index];
        return [...(branch ? [branch] : []), ...properties("all")];
      }
      case "array": {
        const items = getOwn(node, "items");
        const prefix = list(node, "prefixItems") ?? [];
        const some = variant.which !== "few" || (num(node, "minItems") ?? 0) > 0;
        return [...prefix, ...(some && isJsonObject(items ?? null) ? [items as JsonObject] : [])];
      }
      case "object": {
        const additional = getOwn(node, "additionalProperties");
        const extra = variant.which === "extra" && isJsonObject(additional ?? null) ? [additional as JsonObject] : [];
        return [...properties(variant.which === "required" ? "required" : "all"), ...extra];
      }
      default:
        return [];
    }
  }

  #value(schema: NormalizedSchema, depth: number): Generated {
    if (depth > MAX_DEPTH) return FAIL;
    const node = resolveSchema(schema, this.#spec);
    if (!node) return "drift"; // a dangling reference was reported by Ingest; any value will do
    const variants = this.#variants(node);
    const point = sourceOf(node);
    const choice = depth > SHALLOW_DEPTH ? 0 : this.#plan.pick(point, variants.length);
    const variant = variants[choice] ?? { kind: "any" };
    const members = list(node, "allOf") ?? [];
    // A node that only combines allOf members starts from the first member, not from a placeholder.
    let value: Generated | undefined =
      variant.kind === "any" && members.length > 0 ? undefined : this.#variant(node, variant, depth);
    for (const member of members) {
      if (value === FAIL) break;
      const next = this.#value(member, depth + 1);
      value = value === undefined ? next : merge(value, next);
    }
    return value === undefined ? "drift" : value;
  }

  #types(node: JsonObject): string[] | undefined {
    const type = getOwn(node, "type");
    if (Array.isArray(type)) return type.filter((item): item is string => typeof item === "string");
    if (getOwn(node, "properties") !== undefined || getOwn(node, "required") !== undefined) return ["object"];
    if (getOwn(node, "items") !== undefined || getOwn(node, "prefixItems") !== undefined) return ["array"];
    return undefined;
  }

  #variants(node: JsonObject): Variant[] {
    const values = getOwn(node, "enum");
    if (Array.isArray(values) && values.length > 0) return values.map((value) => ({ kind: "value", value }));
    const constant = getOwn(node, "const");
    if (constant !== undefined) return [{ kind: "value", value: constant }];
    for (const keyword of ["oneOf", "anyOf"] as const) {
      const branches = list(node, keyword);
      if (branches && branches.length > 0) return branches.map((_, index) => ({ kind: "branch", keyword, index }));
    }
    const types = this.#types(node);
    if (!types || types.length === 0) return [{ kind: "any" }];
    const out: Variant[] = [];
    for (const type of types) {
      if (type === "null") out.push({ kind: "value", value: null });
      else if (type === "boolean") out.push({ kind: "value", value: true }, { kind: "value", value: false });
      else if (type === "integer" || type === "number") {
        const integer = type === "integer";
        out.push(
          { kind: "number", integer, which: "typical" },
          { kind: "number", integer, which: "low" },
          { kind: "number", integer, which: "high" }
        );
      } else if (type === "string") {
        out.push({ kind: "string", which: "typical" });
        if (getOwn(node, "format") === undefined && getOwn(node, "pattern") === undefined) {
          out.push({ kind: "string", which: "short" }, { kind: "string", which: "long" });
        }
      } else if (type === "array") {
        out.push(
          { kind: "array", which: "typical" },
          { kind: "array", which: "few" },
          { kind: "array", which: "many" }
        );
      } else if (type === "object") {
        out.push({ kind: "object", which: "all" }, { kind: "object", which: "required" });
        if (getOwn(node, "additionalProperties") !== false) out.push({ kind: "object", which: "extra" });
      }
    }
    return out.length > 0 ? out : [{ kind: "any" }];
  }

  #variant(node: JsonObject, variant: Variant, depth: number): Generated {
    switch (variant.kind) {
      case "value":
        return variant.value;
      case "any":
        return "drift";
      case "branch": {
        const branch = list(node, variant.keyword)?.[variant.index];
        if (!branch) return FAIL;
        const value = this.#value(branch, depth + 1);
        // Keywords next to oneOf/anyOf (usually shared properties) apply too.
        if (value !== FAIL && getOwn(node, "properties") !== undefined) {
          return merge(this.#object(node, depth > SHALLOW_DEPTH ? "required" : "all", depth), value);
        }
        return value;
      }
      case "number":
        return numberFor(node, variant.integer, variant.which);
      case "string":
        return stringFor(node, variant.which);
      case "array":
        return this.#array(node, variant.which, depth);
      case "object":
        return this.#object(node, depth > SHALLOW_DEPTH ? "required" : variant.which, depth);
    }
  }

  #array(node: JsonObject, which: "typical" | "few" | "many", depth: number): Generated {
    const min = num(node, "minItems") ?? 0;
    const max = Math.min(num(node, "maxItems") ?? MAX_ITEMS, MAX_ITEMS);
    const deep = depth > SHALLOW_DEPTH;
    let count = which === "few" || deep ? min : which === "many" ? Math.max(min, 3) : Math.max(min, 1);
    count = Math.min(count, max);
    if (count < min) return FAIL; // minItems above what we generate
    const prefix = list(node, "prefixItems") ?? [];
    const items = getOwn(node, "items");
    const out: JsonValue[] = [];
    for (let index = 0; index < Math.max(count, deep ? 0 : prefix.length); index++) {
      const schema = prefix[index] ?? (isJsonObject(items ?? null) ? (items as JsonObject) : undefined);
      const value = schema ? this.#value(schema, depth + 1) : "drift";
      if (value === FAIL) return FAIL;
      out.push(value);
    }
    if (getOwn(node, "uniqueItems") === true) {
      const unique = [...new Map(out.map((value) => [canonicalJson(value), value])).values()];
      return unique.length < min ? FAIL : unique;
    }
    return out;
  }

  #object(node: JsonObject, which: "all" | "required" | "extra", depth: number): Generated {
    const properties = getOwn(node, "properties");
    const props = isJsonObject(properties ?? null) ? (properties as JsonObject) : {};
    const requiredList = getOwn(node, "required");
    const required = new Set(
      Array.isArray(requiredList) ? requiredList.filter((name): name is string => typeof name === "string") : []
    );
    const hidden = this.#direction === "request" ? "readOnly" : "writeOnly";
    const out: JsonObject = {};
    for (const name of [...new Set([...Object.keys(props), ...required])].sort()) {
      const schema = getOwn(props, name);
      const resolved = isJsonObject(schema ?? null) ? resolveSchema(schema as JsonObject, this.#spec) : undefined;
      if (resolved && getOwn(resolved, hidden) === true) continue;
      if (!required.has(name) && which === "required") continue;
      const value = isJsonObject(schema ?? null) ? this.#value(schema as JsonObject, depth + 1) : "drift";
      if (value === FAIL) {
        if (required.has(name)) return FAIL;
        continue;
      }
      out[name] = value;
    }
    const additional = getOwn(node, "additionalProperties");
    const minProperties = num(node, "minProperties") ?? 0;
    let added = 0;
    for (let attempt = 1; additional !== false && attempt <= MAX_ITEMS; attempt++) {
      const wanted = (which === "extra" && added === 0) || Object.keys(out).length < minProperties;
      if (!wanted) break;
      const name = attempt === 1 ? "driftExtra" : `driftExtra${String(attempt)}`;
      if (name in out) continue;
      const value = isJsonObject(additional ?? null) ? this.#value(additional as JsonObject, depth + 1) : "drift";
      if (value === FAIL) return FAIL;
      out[name] = value;
      added++;
    }
    return out;
  }
}

function numberFor(node: JsonObject, integer: boolean, which: "typical" | "low" | "high"): Generated {
  const multiple = num(node, "multipleOf");
  const step = multiple ?? (integer ? 1 : 0.5);
  const exclusiveMin = num(node, "exclusiveMinimum");
  const exclusiveMax = num(node, "exclusiveMaximum");
  const low = num(node, "minimum") ?? (exclusiveMin === undefined ? undefined : exclusiveMin + step);
  const high = num(node, "maximum") ?? (exclusiveMax === undefined ? undefined : exclusiveMax - step);
  let value: number;
  if (which === "low" && low !== undefined) value = low;
  else if (which === "high" && high !== undefined) value = high;
  else if (low !== undefined && high !== undefined) value = low + (high - low) / 2;
  else if (low !== undefined) value = Math.max(low, 1);
  else if (high !== undefined) value = Math.min(high, 1);
  else value = 1;
  if (multiple !== undefined && multiple > 0) value = Math.ceil(value / multiple) * multiple;
  if (integer) value = which === "high" ? Math.floor(value) : Math.ceil(value);
  return Number.isFinite(value) ? value : FAIL;
}

function stringFor(node: JsonObject, which: "typical" | "short" | "long"): Generated {
  const format = getOwn(node, "format");
  const min = num(node, "minLength") ?? 0;
  const max = num(node, "maxLength");
  const formatted = typeof format === "string" ? FORMAT_VALUES[format] : undefined;
  let value: string;
  if (which === "short") value = "a".repeat(min);
  else if (which === "long") value = "a".repeat(Math.min(max ?? Math.max(min, 16), 1024));
  else value = formatted ?? fit("drift", min, max);
  const pattern = getOwn(node, "pattern");
  if (typeof pattern !== "string") return value;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return FAIL;
  }
  const candidates = [value, ...PATTERN_CANDIDATES.map((candidate) => fit(candidate, min, max))];
  const found = candidates.find((candidate) => regex.test(candidate));
  if (found !== undefined) return found;
  // Built from the pattern itself (ids, hashes, codes); checked here, and the sample is validated again later.
  const built = stringMatching(pattern, min);
  const fits = built !== undefined && built.length >= min && (max === undefined || built.length <= max);
  return fits && regex.test(built) ? built : FAIL;
}

function fit(text: string, min: number, max: number | undefined): string {
  const padded = text.length < min ? text + "x".repeat(min - text.length) : text;
  return max !== undefined && padded.length > max ? padded.slice(0, max) : padded;
}

/** Combines the values of allOf members: objects are merged, anything else keeps the first value. */
function merge(a: Generated, b: Generated): Generated {
  if (a === FAIL || b === FAIL) return FAIL;
  if (isJsonObject(a) && isJsonObject(b)) {
    const out: JsonObject = { ...a };
    for (const [key, value] of Object.entries(b)) {
      const merged = key in out ? merge(out[key] ?? null, value) : value;
      if (merged === FAIL) return FAIL;
      out[key] = merged;
    }
    return out;
  }
  return a;
}

/** Media types DRIFT can put a generated body in, and the concrete Content-Type used for each. */
export function concreteMediaType(mediaType: string): string | undefined {
  if (mediaType === "*/*" || mediaType === "application/*") return "application/json";
  if (mediaType === "text/*") return "text/plain";
  if (isJsonMediaType(mediaType) || mediaType === "text/plain") return mediaType;
  return undefined;
}

const IGNORED_HEADERS = new Set(["accept", "content-type", "authorization"]);

/**
 * A request for `operation` generated from its contract, or FAIL when some required part cannot be generated.
 * Optional parameters and bodies are decisions of the plan (point `param:<key>` / `body`: 0 = send, 1 = omit),
 * as is the media type (point `media`).
 */
export function synthesizeRequest(
  spec: SpecIR,
  operation: OperationIR,
  plan: ChoicePlan,
  id: string
): RoutedSample | typeof FAIL {
  const generator = new SchemaGenerator(spec, "request", plan);
  const pathParams: string[] = [];
  const query: Record<string, string[]> = {};
  const headers: Record<string, string[]> = {};
  const cookies: string[] = [];
  for (const [key, param] of Object.entries(operation.parameters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (param.in === "header" && IGNORED_HEADERS.has(param.name.toLowerCase())) continue;
    if (param.in !== "path" && !param.required && plan.pick(`param:${key}`, 2) === 1) continue;
    const value = generator.generate(param.schema);
    const wire = value === FAIL ? undefined : toWire(value);
    if (!wire) {
      if (param.required) return FAIL;
      continue;
    }
    if (param.in === "path") pathParams[Number(key.slice("path:".length))] = wire.join(",");
    else if (param.in === "query") query[param.name] = wire;
    else if (param.in === "header") headers[param.name.toLowerCase()] = [wire.join(",")];
    else cookies.push(`${param.name}=${wire.join(",")}`);
  }
  if (cookies.length > 0) headers.cookie = [cookies.join("; ")];
  let index = 0;
  const path = `${spec.basePaths[0] ?? ""}${operation.path.replace(/\{[^}]*\}/g, () => encodeURIComponent(pathParams[index++] ?? ""))}`;
  const sample: RoutedSample = {
    id,
    origin: "synthetic",
    method: operation.method.toUpperCase(),
    path,
    query,
    headers,
    redacted: [],
    operation: operation.key,
    pathParams: operation.pathParams.map((_, position) => pathParams[position] ?? ""),
  };
  const body = operation.requestBody;
  if (body && (body.required || plan.pick("body", 2) === 0)) {
    const usable = Object.keys(body.content)
      .sort()
      .filter((mediaType) => concreteMediaType(mediaType) !== undefined);
    const mediaType = usable[plan.pick("media", Math.max(usable.length, 1))];
    const contentType = mediaType === undefined ? undefined : concreteMediaType(mediaType);
    if (mediaType === undefined || contentType === undefined) return body.required ? FAIL : sample;
    const value = generator.generate(body.content[mediaType]?.schema);
    if (value === FAIL) return FAIL;
    sample.body = { contentType, value };
    sample.headers["content-type"] = [contentType];
  }
  return sample;
}
