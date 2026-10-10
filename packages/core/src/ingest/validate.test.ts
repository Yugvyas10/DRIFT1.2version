import type { ErrorObject } from "ajv/dist/2020.js";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { memoryReader } from "../testing/memory-reader.ts";
import { openapi } from "../testing/specs.ts";
import { ingestSpec } from "./ingest.ts";
import { condense, withoutDynamicMetaRef } from "./validate.ts";

async function diagnosticsFor(document: unknown) {
  const reader = memoryReader({ "/s/openapi.yaml": stringify(document) });
  return (await ingestSpec("/s/openapi.yaml", { reader })).diagnostics;
}

const okResponse = { "200": { description: "ok" } };

describe("version detection", () => {
  it.each([
    [{ swagger: "2.0", info: {}, paths: {} }, "Swagger 2.0"],
    [{ openapi: "3.2.0", info: {}, paths: {} }, "OpenAPI 3.2.0 is not supported"],
    [{ openapi: 3, info: {}, paths: {} }, 'Missing "openapi"'],
    [["not", "an", "object"], "must be an object"],
  ])("rejects %j", async (document, message) => {
    const [diagnostic] = await diagnosticsFor(document);
    expect(diagnostic?.message).toContain(message);
  });

  it("accepts 3.0.x and 3.1.x, including pre-release suffixes", async () => {
    expect(await diagnosticsFor(openapi({}, {}, "3.0.0"))).toEqual([]);
    expect(await diagnosticsFor(openapi({}, {}, "3.1.1"))).toEqual([]);
    expect(await diagnosticsFor(openapi({}, {}, "3.0.4-rc1"))).toEqual([]);
  });
});

describe("structural validation", () => {
  it("reports located, readable errors without the Reference-branch noise", async () => {
    const diagnostics = await diagnosticsFor(
      openapi({ "/a": { get: { responses: { "200": { descripton: "typo" } } } } })
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Missing required property "description"',
      'Unexpected property "descripton"',
    ]);
    expect(diagnostics.every((d) => d.code === "OAS_SCHEMA" && d.line !== undefined)).toBe(true);
  });

  it("validates 3.1 documents, including Schema Objects inside media types (Ajv $dynamicRef workaround)", async () => {
    const valid = openapi(
      {
        "/a": {
          get: {
            responses: {
              "200": { description: "ok", content: { "application/json": { schema: { type: ["string", "null"] } } } },
            },
          },
        },
      },
      {},
      "3.1.0"
    );
    expect(await diagnosticsFor(valid)).toEqual([]);
    const invalid = openapi(
      {
        "/a": {
          get: { responses: { "200": { description: "ok", content: { "application/json": { schemaa: {} } } } } },
        },
      },
      {},
      "3.1.0"
    );
    expect((await diagnosticsFor(invalid)).map((d) => d.message)).toContain('Unexpected property "schemaa"');
  });

  it("describes type, enum and pattern errors", async () => {
    const diagnostics = await diagnosticsFor(
      openapi({ "/a": { get: { parameters: [{ name: "x", in: "body", schema: {} }], responses: okResponse } } })
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    const typeError = await diagnosticsFor({ openapi: "3.0.3", info: { title: 1, version: "1" }, paths: {} });
    expect(typeError[0]?.message).toBe("Must be of type string, found number");
  });

  it("caps the number of reported problems", async () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++) paths[`/p${i}`] = { get: { responses: { "200": {} } } };
    const diagnostics = await diagnosticsFor(openapi(paths));
    expect(diagnostics).toHaveLength(26);
    expect(diagnostics.at(-1)?.message).toMatch(/^15 more schema problems not shown$/);
  });
});

describe("condense", () => {
  const error = (
    keyword: string,
    instancePath: string,
    params: Record<string, unknown> = {},
    message?: string
  ): ErrorObject => ({ keyword, instancePath, params, schemaPath: "", ...(message ? { message } : {}) }) as ErrorObject;

  it("keeps container errors when they are the only ones", () => {
    const problems = condense([error("oneOf", "/x", {}, "must match exactly one schema in oneOf")], {});
    expect(problems).toEqual([{ tokens: ["x"], message: "Must match exactly one schema in oneOf" }]);
  });

  it("keeps a lone missing-$ref error", () => {
    expect(condense([error("required", "/x", { missingProperty: "$ref" })], {})).toHaveLength(1);
  });

  it("formats enum, format and pattern errors and deduplicates", () => {
    const problems = condense(
      [
        error("enum", "/in", { allowedValues: ["query", "path"] }),
        error("format", "/url", { format: "uri" }),
        error("pattern", "/x-y", { pattern: "^x-" }),
        error("pattern", "/x-y", { pattern: "^x-" }),
        error("minLength", "/n", {}),
      ],
      {}
    );
    expect(problems.map((p) => p.message)).toEqual([
      'Must be one of "query", "path"',
      "Must be a valid uri",
      "Must match the pattern ^x-",
      'Fails the "minLength" rule',
    ]);
  });
});

describe("withoutDynamicMetaRef", () => {
  it("replaces only the #meta dynamic reference", () => {
    expect(withoutDynamicMetaRef({ a: [{ $dynamicRef: "#meta", x: 1 }, { $dynamicRef: "#other" }] })).toEqual({
      a: [{ $ref: "#/$defs/schema", x: 1 }, { $dynamicRef: "#other" }],
    });
  });
});
