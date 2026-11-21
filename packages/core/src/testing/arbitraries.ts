import fc from "fast-check";
import { openapi } from "./specs.ts";

/**
 * Random but always-valid OpenAPI 3.0 documents for property tests. Schemas nest objects, arrays and
 * references to two components, which may reference each other (so cycles are exercised too).
 */
const stringSchema = fc
  .record(
    {
      type: fc.constant("string"),
      maxLength: fc.nat(20),
      enum: fc.uniqueArray(fc.constantFrom("a", "b", "c", "d"), { minLength: 1 }),
      format: fc.constantFrom("date", "uuid", "email"),
      nullable: fc.boolean(),
      default: fc.constantFrom("a", "b"),
    },
    { requiredKeys: ["type"] }
  )
  .map((schema) =>
    schema.enum && schema.default && !schema.enum.includes(schema.default) ? { ...schema, default: undefined } : schema
  )
  .map((schema) => JSON.parse(JSON.stringify(schema)) as Record<string, unknown>);

const numberSchema = fc.record(
  {
    type: fc.constantFrom("integer", "number"),
    minimum: fc.integer({ min: -10, max: 10 }),
    maximum: fc.integer({ min: 11, max: 50 }),
    multipleOf: fc.constantFrom(1, 2, 5),
  },
  { requiredKeys: ["type"] }
);

const refSchema = fc.constantFrom({ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" });

const { schema } = fc.letrec<{ schema: unknown; object: unknown; array: unknown }>((tie) => ({
  schema: fc.oneof(
    { depthSize: "small", maxDepth: 3 },
    stringSchema,
    numberSchema,
    fc.constant({ type: "boolean" }),
    refSchema,
    tie("object"),
    tie("array")
  ),
  object: fc
    .record({
      type: fc.constant("object"),
      properties: fc.dictionary(fc.constantFrom("id", "name", "tags", "owner"), tie("schema"), { maxKeys: 3 }),
      required: fc.subarray(["id", "name"]),
      additionalProperties: fc.boolean(),
    })
    .map(({ required, ...rest }) => (required.length > 0 ? { ...rest, required } : rest)),
  array: fc.record({ type: fc.constant("array"), items: tie("schema") }),
}));

const parameter = fc.record({
  name: fc.constantFrom("limit", "offset", "X-Request-Id"),
  in: fc.constantFrom("query", "header"),
  required: fc.boolean(),
  schema: fc.oneof(stringSchema, numberSchema),
});

const operation = fc
  .record({
    parameters: fc.uniqueArray(parameter, { maxLength: 3, selector: (p) => `${p.in}:${p.name}` }),
    requestBody: fc.option(
      fc.record({ required: fc.boolean(), content: fc.record({ "application/json": fc.record({ schema }) }) }),
      { nil: undefined }
    ),
    response: schema,
    deprecated: fc.boolean(),
  })
  .map(({ response, requestBody, ...rest }) => ({
    ...rest,
    ...(requestBody ? { requestBody } : {}),
    responses: { "200": { description: "ok", content: { "application/json": { schema: response } } } },
  }));

const PATHS = ["/a", "/b/{id}", "/c/{x}/d"] as const;

export const openApiDocument = fc
  .record({
    paths: fc.dictionary(
      fc.constantFrom(...PATHS),
      fc.dictionary(fc.constantFrom("get", "post", "put"), operation, { minKeys: 1, maxKeys: 2 }),
      {
        minKeys: 1,
        maxKeys: 3,
      }
    ),
    a: schema,
    b: schema,
  })
  .map(({ paths, a, b }) => {
    const withPathParams = Object.fromEntries(
      Object.entries(paths).map(([path, item]) => {
        const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
        const parameters = names.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
        return [path, parameters.length > 0 ? { parameters, ...item } : item];
      })
    );
    return openapi(withPathParams, { schemas: { A: a, B: b } });
  });

/** The same document with every object's keys in reverse order. */
export function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)])
    );
  }
  return value;
}
