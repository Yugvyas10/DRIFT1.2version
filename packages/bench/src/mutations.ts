/**
 * Labelled mutations of an OpenAPI document (PLAN M3 start of the mutation benchmark, Q10; completed in M8).
 * Each operator changes one place in a copy of the document and says whether the change is breaking for
 * existing clients. The label comes from the operator, not from DRIFT, so DRIFT is measured against it.
 *
 * Operators work on the raw document (plain JSON), choose their site deterministically from a seed, and
 * return undefined when the document has no suitable site.
 */

type Json = null | boolean | number | string | Json[] | JsonMap;
// A recursive JSON object needs an interface with an index signature (Record<string, Json> would be circular).
interface JsonMap {
  [key: string]: Json;
}
type Doc = JsonMap;

export interface Mutation {
  operator: string;
  label: "breaking" | "safe";
  description: string;
  document: Doc;
}

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

function isObject(value: Json | undefined): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every JSON object in the document with its path, in a stable order; references are not followed. */
function* objects(value: Json, path: string[] = []): Generator<[JsonMap, string[]]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* objects(item, [...path, String(index)]);
  } else if (isObject(value)) {
    yield [value, path];
    for (const key of Object.keys(value).sort()) {
      // Literal data is not schema.
      if (key === "example" || key === "examples" || key === "default" || key === "enum" || key === "const") continue;
      yield* objects(value[key] ?? null, [...path, key]);
    }
  }
}

/** Where a schema sits: under a request body or parameter (request side) or a response. */
function side(path: string[]): "request" | "response" | undefined {
  if (path.includes("responses")) return "response";
  if (path.includes("requestBody") || path.includes("parameters")) return "request";
  return undefined;
}

/** A JSON pointer (RFC 6901) for a path, e.g. `/paths/~1pets/get`. */
function pointer(path: readonly string[]): string {
  return path.map((token) => `/${token.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

function pick<T>(candidates: T[], seed: number): T | undefined {
  return candidates.length === 0 ? undefined : candidates[Math.abs(seed) % candidates.length];
}

function operationsOf(document: Doc): { path: string; method: string; operation: JsonMap }[] {
  const paths = document.paths;
  if (!isObject(paths)) return [];
  return Object.keys(paths)
    .sort()
    .flatMap((path) => {
      const item = paths[path];
      if (!isObject(item)) return [];
      return METHODS.flatMap((method) => {
        const operation = item[method];
        return isObject(operation) ? [{ path, method, operation }] : [];
      });
    });
}

type Operator = (document: Doc, seed: number) => Omit<Mutation, "operator" | "label" | "document"> | undefined;

/**
 * Which sides use each component schema (`#/components/schemas/Name`), following references between components
 * until nothing changes. A component used by requests and responses is on both sides.
 */
function componentSides(document: Doc): Map<string, Set<"request" | "response">> {
  const sides = new Map<string, Set<"request" | "response">>();
  const refs: { from: string | undefined; side: "request" | "response" | undefined; to: string }[] = [];
  for (const [node, path] of objects(document)) {
    if (typeof node.$ref !== "string" || !node.$ref.startsWith("#/components/schemas/")) continue;
    const to = node.$ref.split("/").slice(0, 4).join("/");
    const from =
      path[0] === "components" && path[1] === "schemas" ? `#/components/schemas/${path[2] ?? ""}` : undefined;
    refs.push({ from, side: side(path), to });
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const { from, side: where, to } of refs) {
      const target = sides.get(to) ?? new Set();
      const sources = from === undefined ? (where ? [where] : []) : [...(sides.get(from) ?? [])];
      for (const s of sources) {
        if (!target.has(s)) {
          target.add(s);
          changed = true;
        }
      }
      sides.set(to, target);
    }
  }
  return sides;
}

/**
 * Schemas used on exactly one side, found by a predicate: inline schemas under that side, and component schemas
 * that only that side uses (a component shared by requests and responses would make the label ambiguous).
 */
function schemas(document: Doc, where: "request" | "response", test: (node: JsonMap) => boolean) {
  const usage = componentSides(document);
  return [...objects(document)].filter(([node, path]) => {
    if (!test(node)) return false;
    if (path[0] === "components") {
      if (path[1] !== "schemas") return false;
      const used = usage.get(`#/components/schemas/${path[2] ?? ""}`);
      return used?.size === 1 && used.has(where);
    }
    return side(path) === where;
  });
}

const OPERATORS: Record<string, { label: "breaking" | "safe"; apply: Operator }> = {
  "request-enum-value-removed": {
    label: "breaking",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "request", (n) => Array.isArray(n.enum) && n.enum.length > 1),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      const values = node.enum as Json[];
      const removed = values.splice(Math.abs(seed) % values.length, 1)[0];
      return { description: `removed enum value ${JSON.stringify(removed)} at ${pointer(path)}` };
    },
  },
  "request-bound-tightened": {
    label: "breaking",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "request", (n) => typeof n.maximum === "number" || n.type === "string"),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      if (typeof node.maximum === "number") {
        const before = node.maximum;
        node.maximum = Math.floor((before + (typeof node.minimum === "number" ? node.minimum : 0)) / 2);
        return { description: `maximum ${String(before)} → ${String(node.maximum)} at ${pointer(path)}` };
      }
      const before = typeof node.maxLength === "number" ? node.maxLength : undefined;
      node.maxLength = Math.max(typeof node.minLength === "number" ? node.minLength : 0, 1);
      return { description: `maxLength ${String(before ?? "none")} → ${String(node.maxLength)} at ${pointer(path)}` };
    },
  },
  "request-required-field-added": {
    label: "breaking",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "request", (n) => isObject(n.properties ?? null)),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      (node.properties as JsonMap).driftAdded = { type: "string" };
      node.required = [...(Array.isArray(node.required) ? node.required : []), "driftAdded"];
      return { description: `required property driftAdded added at ${pointer(path)}` };
    },
  },
  "operation-removed": {
    label: "breaking",
    apply: (document, seed) => {
      const site = pick(operationsOf(document), seed);
      if (!site) return undefined;
      const item = (document.paths as Record<string, JsonMap>)[site.path];
      if (item) Reflect.deleteProperty(item, site.method);
      return { description: `${site.method.toUpperCase()} ${site.path} removed` };
    },
  },
  "response-enum-value-added": {
    label: "breaking",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "response", (n) => Array.isArray(n.enum) && n.enum.every((v) => typeof v === "string")),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      (node.enum as Json[]).push("drift_new_value");
      return { description: `response enum value "drift_new_value" added at ${pointer(path)}` };
    },
  },
  "request-optional-field-added": {
    label: "safe",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "request", (n) => isObject(n.properties ?? null)),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      (node.properties as JsonMap).driftOptional = { type: "string" };
      return { description: `optional property driftOptional added at ${pointer(path)}` };
    },
  },
  "operation-added": {
    label: "safe",
    apply: (document) => {
      if (!isObject(document.paths ?? null)) return undefined;
      (document.paths as JsonMap)["/drift-added"] = {
        get: { responses: { "200": { description: "Added by the mutation benchmark" } } },
      };
      return { description: "GET /drift-added added" };
    },
  },
  "description-edited": {
    label: "safe",
    apply: (document, seed) => {
      const site = pick(operationsOf(document), seed);
      if (!site) return undefined;
      site.operation.description = `${typeof site.operation.description === "string" ? site.operation.description : ""} (edited)`;
      return { description: `description of ${site.method.toUpperCase()} ${site.path} edited` };
    },
  },
  "request-bound-relaxed": {
    label: "safe",
    apply: (document, seed) => {
      const site = pick(
        schemas(document, "request", (n) => typeof n.maximum === "number"),
        seed
      );
      if (!site) return undefined;
      const [node, path] = site;
      const before = node.maximum as number;
      node.maximum = before * 2 + 1;
      return { description: `maximum ${String(before)} → ${String(node.maximum)} at ${pointer(path)}` };
    },
  },
};

export const MUTATION_OPERATORS = Object.keys(OPERATORS).sort();

/** Applies one operator to a deep copy of `document`. */
export function mutate(document: Doc, operator: string, seed: number): Mutation | undefined {
  const spec = OPERATORS[operator];
  if (!spec) throw new Error(`Unknown mutation operator ${operator}`);
  const copy = structuredClone(document);
  const applied = spec.apply(copy, seed);
  return applied && { operator, label: spec.label, description: applied.description, document: copy };
}
