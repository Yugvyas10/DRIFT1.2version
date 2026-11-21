import type { Direction } from "@drift/report-schema";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { NormalizedSchema, SpecIR } from "../ingest/ir.ts";
import { getOwn, isJsonObject, type JsonObject, type JsonValue } from "../util/json.ts";

/** Keywords whose values are data, not schemas: never rewritten. */
const DATA_KEYWORDS = new Set(["enum", "const", "default", "examples", "example"]);
/** Keywords DRIFT keeps in the IR but does not validate with (the discriminator is advisory in OpenAPI). */
const DROPPED_KEYWORDS = new Set(["discriminator"]);

export type Validate = (value: unknown) => { valid: true } | { valid: false; errors: ErrorObject[] };

/**
 * Compiled JSON Schema validators for one contract (PLAN §4.4). Each validator is compiled once per
 * (operation, direction, part, media type) and cached; the spec hash is implied because there is one instance
 * per contract. `compiled` counts compilations, so tests can assert the cache works.
 *
 * Schemas are prepared per direction: `readOnly` properties are not required in requests and `writeOnly`
 * properties are not required in responses (OpenAPI 3.x). Component references become references to schemas
 * added to Ajv once per direction, so shared and recursive components are compiled once.
 */
export class Validators {
  compiled = 0;
  readonly #spec: SpecIR;
  readonly #ajv: Ajv2020;
  readonly #cache = new Map<string, Validate | undefined>();
  readonly #added = new Set<string>();
  /** Why a validator could not be compiled (for example an invalid `pattern`), by cache key. */
  readonly failures = new Map<string, string>();

  constructor(spec: SpecIR) {
    this.#spec = spec;
    this.#ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      verbose: true,
      logger: false,
      validateSchema: false,
      // OpenAPI patterns are ECMA-262 without the u flag; with it, common escapes such as \- are syntax errors.
      unicodeRegExp: false,
    });
    addFormats.default(this.#ajv);
    this.#ajv.addKeyword({ keyword: "$source", schemaType: "string" });
  }

  /** The validator for `schema` under `key`, compiled on first use; undefined if the schema cannot be compiled. */
  get(direction: Direction, key: string, schema: NormalizedSchema): Validate | undefined {
    const cacheKey = `${direction}\0${key}`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    let validate: Validate | undefined;
    try {
      const compiled: ValidateFunction = this.#ajv.compile(this.#prepare(schema, direction) as object);
      this.compiled++;
      validate = (value) => (compiled(value) ? { valid: true } : { valid: false, errors: compiled.errors ?? [] });
    } catch (error) {
      this.failures.set(cacheKey, error instanceof Error ? error.message : String(error));
      validate = undefined;
    }
    this.#cache.set(cacheKey, validate);
    return validate;
  }

  #uri(direction: Direction, id: string): string {
    return `drift:${direction}/${encodeURIComponent(id)}`;
  }

  #ensure(direction: Direction, id: string): string {
    const uri = this.#uri(direction, id);
    if (this.#added.has(uri)) return uri;
    this.#added.add(uri); // before preparing, so recursive components terminate
    const component = this.#spec.schemas[id];
    this.#ajv.addSchema(this.#prepare(component ?? {}, direction) as object, uri);
    return uri;
  }

  #prepare(node: JsonValue, direction: Direction): JsonValue {
    if (Array.isArray(node)) return node.map((item) => this.#prepare(item, direction));
    if (!isJsonObject(node)) return node;
    const out: JsonObject = {};
    for (const [key, value] of Object.entries(node)) {
      if (DROPPED_KEYWORDS.has(key)) continue;
      if (key === "$ref" && typeof value === "string") out.$ref = this.#ensure(direction, value);
      else if (DATA_KEYWORDS.has(key)) out[key] = value;
      else if (key === "properties" && isJsonObject(value)) {
        out.properties = Object.fromEntries(
          Object.entries(value).map(([name, schema]) => [name, this.#prepare(schema, direction)])
        );
      } else out[key] = this.#prepare(value, direction);
    }
    const required = getOwn(node, "required");
    const properties = getOwn(node, "properties");
    if (Array.isArray(required) && isJsonObject(properties)) {
      const hidden = direction === "request" ? "readOnly" : "writeOnly";
      out.required = required.filter((name) => {
        const property = typeof name === "string" ? getOwn(properties, name) : undefined;
        return !(property !== undefined && isJsonObject(property) && this.#flag(property, hidden));
      });
    }
    return out;
  }

  /** Whether a (possibly referenced) schema sets `readOnly`/`writeOnly`. */
  #flag(schema: JsonObject, keyword: "readOnly" | "writeOnly"): boolean {
    let current: JsonObject | undefined = schema;
    for (let hops = 0; current && hops < 32; hops++) {
      if (getOwn(current, keyword) === true) return true;
      const ref = getOwn(current, "$ref");
      current = typeof ref === "string" ? this.#spec.schemas[ref] : undefined;
    }
    return false;
  }
}
