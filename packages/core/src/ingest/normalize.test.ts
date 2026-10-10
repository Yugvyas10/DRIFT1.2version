import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ingestObject, openapi } from "../testing/specs.ts";
import { withoutSources } from "../util/schema.ts";
import type { JsonObject } from "../util/json.ts";

/** Normalises one schema by putting it in a response body and reading it back from the IR. */
async function normalize(schema: unknown, components: Record<string, unknown> = {}, version = "3.0.3") {
  const spec = await ingestObject(
    openapi(
      { "/x": { get: { responses: { "200": { description: "ok", content: { "application/json": { schema } } } } } } },
      { schemas: components },
      version
    )
  );
  const node = spec.ir.operations["GET /x"]?.responses["200"]?.content["application/json"]?.schema;
  if (!node) throw new Error("schema missing from the IR");
  return {
    node: withoutSources(node) as JsonObject,
    schemas: withoutSources(spec.ir.schemas) as JsonObject,
    raw: node,
  };
}

describe("schema normalisation", () => {
  it("turns 3.0 nullable into a type array and keeps type arrays sorted", async () => {
    expect((await normalize({ type: "string", nullable: true })).node).toEqual({ type: ["null", "string"] });
    expect((await normalize({ type: ["string", "null"] }, {}, "3.1.0")).node).toEqual({ type: ["null", "string"] });
  });

  it("drops nullable when there is no type to extend", async () => {
    expect((await normalize({ nullable: true })).node).toEqual({});
  });

  it("converts 3.0 boolean exclusive bounds to the numeric form", async () => {
    expect(
      (await normalize({ type: "number", minimum: 1, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: false }))
        .node
    ).toEqual({
      type: ["number"],
      exclusiveMinimum: 1,
      maximum: 9,
    });
  });

  it("keeps 3.1 numeric exclusive bounds", async () => {
    expect((await normalize({ exclusiveMinimum: 0, exclusiveMaximum: 5 }, {}, "3.1.0")).node).toEqual({
      exclusiveMinimum: 0,
      exclusiveMaximum: 5,
    });
  });

  it("drops examples, extensions and keywords DRIFT does not compare", async () => {
    expect(
      (
        await normalize({
          type: "string",
          example: "x",
          "x-foo": 1,
          xml: { name: "a" },
          externalDocs: { url: "https://e.x" },
        })
      ).node
    ).toEqual({
      type: ["string"],
    });
  });

  it("merges a safe allOf, following component references", async () => {
    const { node } = await normalize(
      {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", required: ["b"], properties: { b: { type: "string" } } },
        ],
      },
      { Base: { type: "object", required: ["a"], properties: { a: { type: "integer" } }, description: "Base" } }
    );
    expect(node).toEqual({
      type: ["object"],
      required: ["a", "b"],
      description: "Base",
      properties: { a: { type: ["integer"] }, b: { type: ["string"] } },
    });
  });

  it("keeps allOf when members conflict or use keywords that cannot be merged", async () => {
    const conflict = await normalize({
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { a: { type: "integer" } } },
      ],
    });
    expect(conflict.node).toHaveProperty("allOf");
    const unmergeable = await normalize({
      allOf: [{ type: "object", additionalProperties: false }, { type: "object" }],
    });
    expect(unmergeable.node).toHaveProperty("allOf");
    const noCommonType = await normalize({ allOf: [{ type: "string" }, { type: "integer" }] });
    expect(noCommonType.node).toHaveProperty("allOf");
  });

  it("intersects integer and number when merging", async () => {
    expect((await normalize({ allOf: [{ type: "number" }, { type: "integer" }] })).node).toEqual({ type: ["integer"] });
  });

  it("keeps recursive schemas as references instead of expanding them", async () => {
    const { node, schemas } = await normalize(
      { $ref: "#/components/schemas/Node" },
      { Node: { type: "object", properties: { next: { $ref: "#/components/schemas/Node" } } } }
    );
    expect(node).toEqual({ $ref: "#/components/schemas/Node" });
    expect(schemas["#/components/schemas/Node"]).toEqual({
      type: ["object"],
      properties: { next: { $ref: "#/components/schemas/Node" } },
    });
  });

  it("does not merge an allOf that refers back to itself", async () => {
    const { schemas } = await normalize(
      { $ref: "#/components/schemas/A" },
      { A: { allOf: [{ $ref: "#/components/schemas/A" }, { type: "object" }] } }
    );
    expect(schemas["#/components/schemas/A"]).toHaveProperty("allOf");
  });

  it("applies 3.1 $ref siblings as allOf, and ignores them in 3.0", async () => {
    const components = { Pet: { type: "object", properties: { id: { type: "string" } } } };
    const v31 = await normalize(
      { $ref: "#/components/schemas/Pet", required: ["id"], description: "d" },
      components,
      "3.1.0"
    );
    expect(v31.node).toEqual({ type: ["object"], required: ["id"], properties: { id: { type: ["string"] } } });
    const v30 = await normalize({ $ref: "#/components/schemas/Pet" }, components);
    expect(v30.node).toEqual({ $ref: "#/components/schemas/Pet" });
  });

  it("normalises boolean schemas (3.1)", async () => {
    expect((await normalize({ type: "object", properties: { any: true, none: false } }, {}, "3.1.0")).node).toEqual({
      type: ["object"],
      properties: { any: {}, none: { not: {} } },
    });
  });

  it("resolves discriminator mappings to component ids", async () => {
    const { node } = await normalize(
      {
        oneOf: [{ $ref: "#/components/schemas/Cat" }],
        discriminator: { propertyName: "kind", mapping: { cat: "Cat", dog: "#/components/schemas/Missing" } },
      },
      { Cat: { type: "object" } }
    );
    expect(node.discriminator).toEqual({
      propertyName: "kind",
      mapping: { cat: "#/components/schemas/Cat", dog: "#/components/schemas/Missing" },
    });
  });

  it("records where every node came from", async () => {
    const { raw } = await normalize({ type: "object", properties: { a: { type: "string" } } });
    expect(raw.$source).toBe("#/paths/~1x/get/responses/200/content/application~1json/schema");
    expect((raw.properties as JsonObject).a).toMatchObject({
      $source: "#/paths/~1x/get/responses/200/content/application~1json/schema/properties/a",
    });
  });

  it("is idempotent: normalising normalised output (as 3.1) gives the same schema", async () => {
    const leaf = fc.record(
      {
        type: fc.constantFrom("string", "integer", "number", "boolean"),
        minimum: fc.integer({ min: -5, max: 5 }),
        maxLength: fc.nat(10),
        enum: fc.uniqueArray(fc.constantFrom("a", "b", "c"), { minLength: 1 }),
        nullable: fc.boolean(),
        description: fc.string({ maxLength: 5 }),
      },
      { requiredKeys: [] }
    );
    const schema = fc
      .record({
        type: fc.constant("object"),
        properties: fc.dictionary(fc.constantFrom("p", "q", "r"), leaf),
        required: fc.subarray(["p", "q"]),
      })
      .map(({ required, ...rest }) => (required.length > 0 ? { ...rest, required } : rest)); // 3.0 requires a non-empty list
    await fc.assert(
      fc.asyncProperty(schema, async (raw) => {
        const once = (await normalize(raw)).node;
        const twice = (await normalize(once, {}, "3.1.0")).node;
        expect(twice).toEqual(once);
      }),
      { numRuns: 40 }
    );
  }, 120_000);
});
