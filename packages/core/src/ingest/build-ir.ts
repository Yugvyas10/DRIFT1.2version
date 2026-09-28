import type { Diagnostic } from "@drift/report-schema";
import { canonicalJson } from "../hash/canonical-json.ts";
import { getOwn, isJsonObject, type JsonObject, type JsonValue } from "../util/json.ts";
import { refDiagnostic, type DocumentSet } from "./documents.ts";
import type {
  MediaTypeIR,
  OperationIR,
  ParameterIR,
  ParameterLocation,
  RequestBodyIR,
  ResponseIR,
  SecurityRequirementIR,
  SpecIR,
} from "./ir.ts";
import { child, SchemaNormalizer } from "./normalize.ts";
import { locationOf, resolveRef, type Place } from "./refs.ts";
import type { OasLine } from "./validate.ts";

export const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const PARAMETER_LOCATIONS = new Set<string>(["path", "query", "header", "cookie"]);
const MAX_REF_HOPS = 32;

/** `/users/{id}/posts/{postId}` → template `/users/{}/posts/{}`, names `["id", "postId"]`. */
export function pathTemplate(path: string): { template: string; names: string[] } {
  const names: string[] = [];
  const template = path.replace(/\{([^}]*)\}/g, (_match, name: string) => {
    names.push(name);
    return "{}";
  });
  return { template, names };
}

/** Builds the IR of a loaded, structurally valid document set. */
export function buildIR(
  set: DocumentSet,
  line: OasLine,
  oasVersion: string
): { ir: SpecIR; diagnostics: Diagnostic[] } {
  const builder = new IrBuilder(set, line);
  const ir = builder.build(oasVersion);
  return { ir, diagnostics: builder.diagnostics };
}

class IrBuilder {
  readonly diagnostics: Diagnostic[] = [];
  readonly #set: DocumentSet;
  readonly #schemas: SchemaNormalizer;

  constructor(set: DocumentSet, line: OasLine) {
    this.#set = set;
    this.#schemas = new SchemaNormalizer(set, line, (diagnostic) => this.diagnostics.push(diagnostic));
  }

  build(oasVersion: string): SpecIR {
    const root = this.#set.root;
    const doc = root.value as JsonObject;
    const info = getOwn(doc, "info");
    const title = isJsonObject(info) ? getOwn(info, "title") : undefined;
    const version = isJsonObject(info) ? getOwn(info, "version") : undefined;
    const globalSecurity = getOwn(doc, "security");

    const operations: Record<string, OperationIR> = {};
    const paths = getOwn(doc, "paths");
    const templates = new Map<string, string>();
    if (isJsonObject(paths)) {
      for (const path of Object.keys(paths).sort()) {
        const itemPlace: Place = { document: root, tokens: ["paths", path] };
        const item = this.#deref(getOwn(paths, path) ?? null, itemPlace);
        if (!item) continue;
        const { template, names } = pathTemplate(path);
        const clash = templates.get(template);
        if (clash !== undefined) {
          // OpenAPI forbids this, but real specs (GitHub's) do it with disjoint methods, which is unambiguous.
          this.#warn(itemPlace, "PATH_TEMPLATE_CONFLICT", `"${path}" and "${clash}" are the same path template`);
        } else {
          templates.set(template, path);
        }
        const shared = this.#parameterList(getOwn(item.value, "parameters"), child(item.place, "parameters"));
        for (const method of HTTP_METHODS) {
          const operation = getOwn(item.value, method);
          if (!isJsonObject(operation)) continue;
          const opPlace = child(item.place, method);
          const built = this.#operation(method, path, template, names, operation, opPlace, shared, globalSecurity);
          const existing = operations[built.key];
          if (existing) {
            this.#warn(
              opPlace,
              "PATH_TEMPLATE_CONFLICT",
              `${built.key} is defined twice: "${existing.path}" and "${path}"`,
              "error"
            );
            continue;
          }
          operations[built.key] = built;
        }
      }
    }
    this.#schemas.drain();
    return {
      irVersion: 1,
      oasVersion,
      info: { title: typeof title === "string" ? title : "", version: typeof version === "string" ? version : "" },
      basePaths: basePaths(getOwn(doc, "servers")),
      operations,
      schemas: this.#schemas.schemas,
    };
  }

  #operation(
    method: string,
    path: string,
    template: string,
    names: string[],
    raw: JsonObject,
    place: Place,
    shared: { value: JsonObject; place: Place }[],
    globalSecurity: JsonValue | undefined
  ): OperationIR {
    const own = this.#parameterList(getOwn(raw, "parameters"), child(place, "parameters"));
    // Operation-level parameters override path-level ones with the same location and name.
    const byIdentity = new Map<string, { value: JsonObject; place: Place }>();
    for (const parameter of [...shared, ...own]) {
      const location = getOwn(parameter.value, "in");
      const name = getOwn(parameter.value, "name");
      if (typeof location === "string" && typeof name === "string") byIdentity.set(`${location}:${name}`, parameter);
    }
    const parameters: Record<string, ParameterIR> = {};
    const declaredPathNames = new Set<string>();
    for (const { value, place: at } of byIdentity.values()) {
      const location = getOwn(value, "in");
      const name = getOwn(value, "name");
      if (typeof name !== "string" || typeof location !== "string" || !PARAMETER_LOCATIONS.has(location)) continue;
      let key: string;
      if (location === "path") {
        declaredPathNames.add(name);
        const position = names.indexOf(name);
        if (position === -1) {
          this.#warn(at, "PATH_PARAM_UNDECLARED", `Path parameter "${name}" does not appear in "${path}"`);
          continue;
        }
        key = `path:${position}`;
      } else {
        key = location === "header" ? `header:${name.toLowerCase()}` : `${location}:${name}`;
      }
      parameters[key] = this.#parameter(value, at, name, location as ParameterLocation);
    }
    for (const name of names) {
      if (!declaredPathNames.has(name)) {
        this.#warn(place, "PATH_PARAM_UNDECLARED", `Path parameter "{${name}}" in "${path}" is not declared`);
      }
    }

    const operation: OperationIR = {
      key: `${method.toUpperCase()} ${template}`,
      method,
      path,
      template,
      pathParams: names,
      source: locationOf(place),
      deprecated: getOwn(raw, "deprecated") === true,
      parameters,
      responses: this.#responses(getOwn(raw, "responses"), child(place, "responses")),
      security: normalizeSecurity(getOwn(raw, "security") ?? globalSecurity),
    };
    for (const key of ["operationId", "summary", "description"] as const) {
      const value = getOwn(raw, key);
      if (typeof value === "string") operation[key] = value;
    }
    const body = getOwn(raw, "requestBody");
    if (body !== undefined) {
      const requestBody = this.#requestBody(body, child(place, "requestBody"));
      if (requestBody) operation.requestBody = requestBody;
    }
    return operation;
  }

  #parameterList(raw: JsonValue | undefined, place: Place): { value: JsonObject; place: Place }[] {
    if (!Array.isArray(raw)) return [];
    const list: { value: JsonObject; place: Place }[] = [];
    raw.forEach((item, index) => {
      const resolved = this.#deref(item, child(place, String(index)));
      if (resolved) list.push(resolved);
    });
    return list;
  }

  #parameter(raw: JsonObject, place: Place, name: string, location: ParameterLocation): ParameterIR {
    let schema = this.#schemas.normalize(true, child(place, "schema"));
    const rawSchema = getOwn(raw, "schema");
    if (rawSchema !== undefined) {
      schema = this.#schemas.normalize(rawSchema, child(place, "schema"));
    } else {
      // A parameter may describe its value with `content` (one media type) instead of `schema`.
      const content = this.#content(getOwn(raw, "content"), child(place, "content"));
      const first = Object.values(content)[0];
      if (first?.schema) schema = first.schema;
    }
    const parameter: ParameterIR = {
      name,
      in: location,
      required: location === "path" || getOwn(raw, "required") === true,
      deprecated: getOwn(raw, "deprecated") === true,
      schema,
      source: locationOf(place),
    };
    const description = getOwn(raw, "description");
    if (typeof description === "string") parameter.description = description;
    return parameter;
  }

  #requestBody(raw: JsonValue, place: Place): RequestBodyIR | undefined {
    const resolved = this.#deref(raw, place);
    if (!resolved) return undefined;
    const body: RequestBodyIR = {
      required: getOwn(resolved.value, "required") === true,
      content: this.#content(getOwn(resolved.value, "content"), child(resolved.place, "content")),
      source: locationOf(resolved.place),
    };
    const description = getOwn(resolved.value, "description");
    if (typeof description === "string") body.description = description;
    return body;
  }

  #responses(raw: JsonValue | undefined, place: Place): Record<string, ResponseIR> {
    const responses: Record<string, ResponseIR> = {};
    if (!isJsonObject(raw)) return responses;
    for (const [status, value] of Object.entries(raw)) {
      if (status.startsWith("x-")) continue;
      const resolved = this.#deref(value, child(place, status));
      if (!resolved) continue;
      const response: ResponseIR = {
        content: this.#content(getOwn(resolved.value, "content"), child(resolved.place, "content")),
        source: locationOf(resolved.place),
      };
      const description = getOwn(resolved.value, "description");
      if (typeof description === "string") response.description = description;
      responses[status === "default" ? "default" : status.toUpperCase()] = response;
    }
    return responses;
  }

  #content(raw: JsonValue | undefined, place: Place): Record<string, MediaTypeIR> {
    const content: Record<string, MediaTypeIR> = {};
    if (!isJsonObject(raw)) return content;
    for (const [mediaType, value] of Object.entries(raw)) {
      const at = child(place, mediaType);
      const schema = isJsonObject(value) ? getOwn(value, "schema") : undefined;
      content[normalizeMediaType(mediaType)] = {
        schema: schema === undefined ? null : this.#schemas.normalize(schema, child(at, "schema")),
        source: locationOf(at),
      };
    }
    return content;
  }

  /** Follows Reference Objects (for parameters, bodies, responses and path items) to the real object. */
  #deref(value: JsonValue, place: Place): { value: JsonObject; place: Place } | undefined {
    let current = value;
    let at = place;
    for (let hops = 0; hops <= MAX_REF_HOPS; hops++) {
      if (!isJsonObject(current)) return undefined;
      const ref = getOwn(current, "$ref");
      if (typeof ref !== "string") return { value: current, place: at };
      const resolution = resolveRef(this.#set, at.document, ref);
      if (!resolution.ok) {
        this.diagnostics.push(refDiagnostic(at.document, [...at.tokens, "$ref"], resolution.code, resolution.message));
        return undefined;
      }
      current = resolution.target.value;
      at = resolution.target;
    }
    this.diagnostics.push(
      refDiagnostic(place.document, place.tokens, "REF_NOT_FOUND", "$ref chain is circular or too long")
    );
    return undefined;
  }

  #warn(
    place: Place,
    code: "PATH_PARAM_UNDECLARED" | "PATH_TEMPLATE_CONFLICT",
    message: string,
    severity: Diagnostic["severity"] = "warning"
  ) {
    this.diagnostics.push(refDiagnostic(place.document, place.tokens, code, message, severity));
  }
}

/** Lower-case, without spaces: `Application/JSON; charset=UTF-8` → `application/json;charset=utf-8`. */
/**
 * The path part of every server URL (`https://api.example.com/v1` → `/v1`), which recorded request paths start
 * with. Server variables take their default value. No servers means the root (`""`), as the specification says.
 */
export function basePaths(servers: JsonValue | undefined): string[] {
  const paths = new Set<string>();
  for (const server of Array.isArray(servers) ? servers : []) {
    if (!isJsonObject(server)) continue;
    const url = getOwn(server, "url");
    if (typeof url !== "string") continue;
    const variables = getOwn(server, "variables");
    const expanded = url.replace(/\{([^}]*)\}/g, (whole, name: string) => {
      const variable = isJsonObject(variables) ? getOwn(variables, name) : undefined;
      const fallback = isJsonObject(variable) ? getOwn(variable, "default") : undefined;
      return typeof fallback === "string" ? fallback : whole;
    });
    const withoutOrigin = expanded.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").replace(/^\/\/[^/]*/, "");
    const path = withoutOrigin.split(/[?#]/)[0] ?? "";
    const trimmed = path.replace(/\/+$/, "");
    paths.add(trimmed === "" ? "" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
  }
  return paths.size === 0 ? [""] : [...paths].sort();
}

export function normalizeMediaType(mediaType: string): string {
  return mediaType.toLowerCase().replace(/\s+/g, "");
}

/** Security alternatives with sorted scopes, sorted and de-duplicated. */
export function normalizeSecurity(raw: JsonValue | undefined): SecurityRequirementIR[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, SecurityRequirementIR>();
  for (const requirement of raw) {
    if (!isJsonObject(requirement)) continue;
    const normalized: SecurityRequirementIR = {};
    for (const scheme of Object.keys(requirement).sort()) {
      const scopes = getOwn(requirement, scheme);
      normalized[scheme] = Array.isArray(scopes)
        ? [...new Set(scopes.filter((scope): scope is string => typeof scope === "string"))].sort()
        : [];
    }
    seen.set(canonicalJson(normalized), normalized);
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, requirement]) => requirement);
}
