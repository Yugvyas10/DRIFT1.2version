import { describe, expect, it } from "vitest";
import type { SpecIR } from "../ingest/ir.ts";
import { ingestObject, openapi } from "../testing/specs.ts";
import type { JsonObject } from "../util/json.ts";
import { concreteMediaType, FAIL, RecordingPlan, SchemaGenerator, synthesizeRequest } from "./synthesize.ts";

const at = (choice: number) => new RecordingPlan(() => choice);
const empty: SpecIR = {
  irVersion: 1,
  oasVersion: "3.1.0",
  info: { title: "", version: "" },
  basePaths: [""],
  operations: {},
  schemas: {},
};

function generate(schema: JsonObject, choice = 0, spec: SpecIR = empty, direction: "request" | "response" = "request") {
  return new SchemaGenerator(spec, direction, at(choice)).generate(schema);
}

/** Every value the generator can produce for a schema, one per variant of its root. */
function variants(schema: JsonObject): unknown[] {
  const root = typeof schema.$source === "string" ? schema.$source : "#";
  const plan = new RecordingPlan(() => 0);
  new SchemaGenerator(empty, "request", plan).generate(schema);
  const choices = plan.seen.get(root)?.choices ?? 1;
  return Array.from({ length: choices }, (_, index) =>
    new SchemaGenerator(empty, "request", new RecordingPlan((point) => (point === root ? index : 0))).generate(schema)
  );
}

describe("SchemaGenerator", () => {
  it("offers every enum value and constant", () => {
    expect(variants({ $source: "#/e", enum: ["a", "b", 3] })).toEqual(["a", "b", 3]);
    expect(generate({ const: { x: 1 } })).toEqual({ x: 1 });
  });

  it("offers typical values and both bounds for numbers", () => {
    expect(variants({ $source: "#/n", type: ["integer"], minimum: 1, maximum: 100 })).toEqual([51, 1, 100]);
    expect(variants({ $source: "#/n", type: ["number"], exclusiveMinimum: 0, exclusiveMaximum: 10 })).toEqual([
      5, 0.5, 9.5,
    ]);
    expect(variants({ $source: "#/n", type: ["integer"], minimum: 3 })).toEqual([3, 3, 3]);
    expect(variants({ $source: "#/n", type: ["number"], maximum: -2 })).toEqual([-2, -2, -2]);
    expect(generate({ type: ["integer"], multipleOf: 5, minimum: 7 })).toBe(10);
    expect(variants({ $source: "#/n", type: ["null", "boolean"] })).toEqual([null, true, false]);
  });

  it("offers typical, shortest and longest strings, format examples and pattern matches", () => {
    expect(variants({ $source: "#/s", type: ["string"], minLength: 2, maxLength: 4 })).toEqual(["drif", "aa", "aaaa"]);
    expect(generate({ type: ["string"], minLength: 8 })).toBe("driftxxx");
    expect(generate({ type: ["string"], format: "email" })).toBe("user@example.com");
    expect(generate({ type: ["string"], format: "made-up" })).toBe("drift");
    expect(generate({ type: ["string"], pattern: "^[A-Z]+$" })).toBe("A");
    expect(generate({ type: ["string"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" })).toBe("2026-01-15");
    expect(generate({ type: ["string"], pattern: "^zz+$" })).toBe(FAIL);
    expect(generate({ type: ["string"], pattern: "([" })).toBe(FAIL);
  });

  it("builds arrays of the typical, minimum and larger sizes, unique when required", () => {
    const items = { type: ["integer"], enum: [1, 2] };
    expect(variants({ $source: "#/a", type: ["array"], items, minItems: 0, maxItems: 5 })).toEqual([
      [1],
      [],
      [1, 1, 1],
    ]);
    expect(generate({ type: ["array"], prefixItems: [{ const: "x" }, { const: 2 }] })).toEqual(["x", 2]);
    expect(generate({ type: ["array"], items, minItems: 2, uniqueItems: true })).toBe(FAIL);
    expect(generate({ type: ["array"], minItems: 3, maxItems: 2 })).toBe(FAIL);
    expect(generate({ type: ["array"], items: { pattern: "^zz+$", type: ["string"] }, minItems: 1 })).toBe(FAIL);
  });

  it("builds objects with all, only required, or extra properties", () => {
    const schema = {
      $source: "#/o",
      type: ["object"],
      required: ["id", "ghost"],
      properties: {
        id: { type: ["integer"] },
        note: { type: ["string"] },
        bad: { type: ["string"], pattern: "^zz+$" },
      },
    };
    expect(variants(schema)).toEqual([
      { id: 1, note: "drift", ghost: "drift" },
      { id: 1, ghost: "drift" },
      { id: 1, note: "drift", ghost: "drift", driftExtra: "drift" },
    ]);
    expect(variants({ $source: "#/c", type: ["object"], additionalProperties: false })).toEqual([{}, {}]);
    expect(generate({ type: ["object"], minProperties: 2, additionalProperties: { type: ["integer"] } })).toEqual({
      driftExtra: 1,
      driftExtra2: 1,
    });
    expect(
      generate({ type: ["object"], required: ["x"], properties: { x: { pattern: "^zz+$", type: ["string"] } } })
    ).toBe(FAIL);
  });

  it("follows oneOf branches, merges allOf members and shared properties", () => {
    const oneOf: JsonObject = {
      $source: "#/v",
      properties: { kind: { type: ["string"] } },
      oneOf: [
        { type: ["object"], properties: { a: { const: 1 } } },
        { type: ["object"], properties: { b: { const: 2 } } },
      ],
    };
    expect(variants(oneOf)).toEqual([
      { kind: "drift", a: 1 },
      { kind: "drift", b: 2 },
    ]);
    expect(generate({ anyOf: [{ const: "x" }] })).toBe("x");
    expect(
      generate({
        type: ["object"],
        properties: { a: { const: 1 } },
        allOf: [
          { properties: { b: { const: 2 }, n: { properties: { c: { const: 3 } } } } },
          { properties: { n: { properties: { d: { const: 4 } } } } },
        ],
      })
    ).toEqual({ a: 1, b: 2, n: { c: 3, d: 4 } });
    expect(generate({ allOf: [{ const: "first" }, { const: "second" }] })).toBe("first");
    expect(generate({ allOf: [{ type: ["string"], pattern: "^zz+$" }] })).toBe(FAIL);
    expect(
      generate({
        type: ["object"],
        properties: { a: { const: 1 } },
        allOf: [{ required: ["a"], properties: { a: { pattern: "^zz+$", type: ["string"] } } }],
      })
    ).toBe(FAIL);
  });

  it("generates something for untyped schemas and stops on endless required recursion", async () => {
    expect(generate({})).toBe("drift");
    expect(new SchemaGenerator(empty, "request", at(0)).generate(null)).toBe("drift");
    const uses = (name: string) => ({
      get: {
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
          },
        },
      },
    });
    const spec = await ingestObject(
      openapi(
        { "/loop": uses("Loop"), "/tree": uses("Tree") },
        {
          schemas: {
            Loop: { type: "object", required: ["next"], properties: { next: { $ref: "#/components/schemas/Loop" } } },
            Tree: {
              type: "object",
              properties: { children: { type: "array", items: { $ref: "#/components/schemas/Tree" } } },
            },
          },
        }
      )
    );
    expect(generate({ $ref: "#/components/schemas/Loop" }, 0, spec.ir)).toBe(FAIL);
    expect(generate({ $ref: "#/components/schemas/Tree" }, 0, spec.ir)).toMatchObject({
      children: [{ children: [{}] }],
    });
    expect(generate({ $ref: "#/components/schemas/Missing" }, 0, spec.ir)).toBe("drift");
  });

  it("leaves out readOnly properties in requests and writeOnly ones in responses", () => {
    const schema = {
      type: ["object"],
      required: ["id", "secret"],
      properties: { id: { type: ["integer"], readOnly: true }, secret: { type: ["string"], writeOnly: true } },
    };
    expect(generate(schema, 0, empty, "request")).toEqual({ secret: "drift" });
    expect(generate(schema, 0, empty, "response")).toEqual({ id: 1 });
  });
});

describe("SchemaGenerator.routes", () => {
  it("finds the variants that lead to a target, through branches, arrays, extra properties and recursion", async () => {
    const leaf = { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["a"] } } };
    const node = {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        // Expandable, as in Stripe: the id string comes first.
        leaf: { anyOf: [{ type: "string" }, { $ref: "#/components/schemas/Leaf" }] },
        children: { type: "array", items: { $ref: "#/components/schemas/Node" } },
        meta: { type: "object", additionalProperties: { $ref: "#/components/schemas/Leaf" } },
        hidden: { readOnly: true, allOf: [{ $ref: "#/components/schemas/Leaf" }] },
      },
    };
    const body = { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } } };
    const paths = { "/nodes": { post: { requestBody: body, responses: { "200": { description: "ok" } } } } };
    const spec = (await ingestObject(openapi(paths, { schemas: { Node: node, Leaf: leaf } }, "3.1.0"))).ir;
    const source = (schema: unknown) => (schema as JsonObject).$source as string;
    const root = spec.schemas["#/components/schemas/Node"];
    if (!root) throw new Error("Node is not in the IR");
    const properties = root.properties as Record<string, JsonObject>;
    const target = "#/components/schemas/Leaf/properties/kind";
    const generator = new SchemaGenerator(spec, "request", at(0));

    const routes = generator.routes(root, new Set([target]));
    expect(routes.get(source(properties.leaf))).toBe(1); // the object branch
    expect(routes.get(source(properties.meta))).toBe(2); // the "extra" variant, which adds a property
    expect(routes.get(source(root))).toBe(0); // all properties
    expect(routes.has(source(properties.children))).toBe(true);
    const steered = new SchemaGenerator(spec, "request", new RecordingPlan((point) => routes.get(point) ?? 0));
    expect(steered.generate(root)).toMatchObject({ leaf: { kind: "a" }, meta: { driftExtra: { kind: "a" } } });
    // A plan that takes the first variant everywhere returns the id string instead.
    expect(generate(root, 0, spec)).toMatchObject({ leaf: "drift" });

    expect(generator.routes(root, new Set(["#/nowhere"])).size).toBe(0);
    expect(generator.routes(undefined, new Set([target])).size).toBe(0);
  });
});

describe("synthesizeRequest", () => {
  const document = openapi({
    "/pets/{id}": {
      post: {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 5 } },
          { name: "tags", in: "query", schema: { type: "array", items: { type: "string", enum: ["a", "b"] } } },
          { name: "X-Trace", in: "header", required: true, schema: { type: "string" } },
          { name: "Accept", in: "header", schema: { type: "string" } },
          { name: "sid", in: "cookie", schema: { type: "string" } },
          { name: "filter", in: "query", required: true, schema: { type: "object" } },
        ],
        requestBody: {
          content: {
            "application/xml": { schema: { type: "string" } },
            "application/json": { schema: { type: "object", properties: { n: { type: "integer" } } } },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
  });

  it("generates path, query, header and cookie parameters and a body", async () => {
    const spec = (await ingestObject({ ...document, servers: [{ url: "/api" }] })).ir;
    const operation = spec.operations["POST /pets/{}"];
    if (!operation) throw new Error("missing operation");
    // The required object parameter has no wire form, so the whole request cannot be generated.
    expect(synthesizeRequest(spec, operation, at(0), "s:1")).toBe(FAIL);
    delete operation.parameters["query:filter"];
    const sample = synthesizeRequest(spec, operation, at(0), "s:1");
    expect(sample).toEqual({
      id: "s:1",
      origin: "synthetic",
      method: "POST",
      path: "/api/pets/5",
      query: { tags: ["a"] },
      headers: { "x-trace": ["drift"], cookie: ["sid=drift"], "content-type": ["application/json"] },
      body: { contentType: "application/json", value: { n: 1 } },
      redacted: [],
      operation: "POST /pets/{}",
      pathParams: ["5"],
    });
    const omitted = synthesizeRequest(spec, operation, at(1), "s:2");
    expect(omitted).not.toBe(FAIL);
    if (omitted === FAIL) return;
    expect(omitted.query).toEqual({});
    expect(omitted.body).toBeUndefined();
  });

  it("fails when a required body has no media type it can generate", async () => {
    const spec = (
      await ingestObject(
        openapi({
          "/upload": {
            post: {
              requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string" } } } },
              responses: { "200": { description: "ok" } },
            },
          },
        })
      )
    ).ir;
    const operation = spec.operations["POST /upload"];
    if (!operation) throw new Error("missing operation");
    expect(synthesizeRequest(spec, operation, at(0), "s:1")).toBe(FAIL);
    operation.requestBody = {
      ...operation.requestBody,
      required: false,
      content: operation.requestBody?.content ?? {},
      source: "#",
    };
    expect(synthesizeRequest(spec, operation, at(0), "s:1")).toMatchObject({ path: "/upload" });
  });

  it("maps wildcard media types to a concrete Content-Type", () => {
    expect(
      ["*/*", "application/*", "text/*", "text/plain", "application/vnd.x+json", "image/png"].map(concreteMediaType)
    ).toEqual([
      "application/json",
      "application/json",
      "text/plain",
      "text/plain",
      "application/vnd.x+json",
      undefined,
    ]);
  });
});
