import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { memoryReader } from "../testing/memory-reader.ts";
import { ingestObject, openapi } from "../testing/specs.ts";
import { basePaths, normalizeMediaType, normalizeSecurity, pathTemplate } from "./build-ir.ts";
import { ingestSpec } from "./ingest.ts";

const ok = { "200": { description: "ok" } };

describe("pathTemplate", () => {
  it("erases parameter names but keeps their order", () => {
    expect(pathTemplate("/users/{id}/posts/{postId}")).toEqual({
      template: "/users/{}/posts/{}",
      names: ["id", "postId"],
    });
    expect(pathTemplate("/health")).toEqual({ template: "/health", names: [] });
  });
});

describe("IR operations", () => {
  it("keys operations by method and template, and parameters by location", async () => {
    const spec = await ingestObject(
      openapi({
        "/users/{userId}": {
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            { name: "X-Tenant", in: "header", schema: { type: "string" } },
          ],
          get: {
            operationId: "getUser",
            parameters: [
              { name: "X-Tenant", in: "header", required: true, schema: { type: "integer" } },
              { name: "fields", in: "query", content: { "application/json": { schema: { type: "array" } } } },
              { name: "session", in: "cookie", schema: { type: "string" } },
            ],
            responses: {
              "200": { description: "ok" },
              "4XX": { description: "client error" },
              default: { description: "other" },
              "x-note": "ignored",
            },
          },
        },
      })
    );
    const op = spec.ir.operations["GET /users/{}"];
    expect(op).toMatchObject({
      method: "get",
      path: "/users/{userId}",
      pathParams: ["userId"],
      operationId: "getUser",
    });
    expect(Object.keys(op?.parameters ?? {}).sort()).toEqual([
      "cookie:session",
      "header:x-tenant",
      "path:0",
      "query:fields",
    ]);
    // The operation-level header overrides the path-level one.
    expect(op?.parameters["header:x-tenant"]).toMatchObject({ required: true, schema: { type: ["integer"] } });
    expect(op?.parameters["query:fields"]?.schema).toMatchObject({ type: ["array"] });
    expect(op?.parameters["path:0"]?.required).toBe(true);
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual(["200", "4XX", "default"]);
  });

  it("follows references to parameters, bodies and responses", async () => {
    const spec = await ingestObject(
      openapi(
        {
          "/a": {
            post: {
              parameters: [{ $ref: "#/components/parameters/Limit" }],
              requestBody: { $ref: "#/components/requestBodies/Body" },
              responses: { "200": { $ref: "#/components/responses/Ok" } },
            },
          },
        },
        {
          parameters: { Limit: { name: "limit", in: "query", schema: { type: "integer" } } },
          requestBodies: {
            Body: { required: true, content: { "Application/JSON; charset=UTF-8": { schema: { type: "object" } } } },
          },
          responses: { Ok: { description: "ok", content: { "text/plain": {} } } },
        }
      )
    );
    const op = spec.ir.operations["POST /a"];
    expect(op?.parameters["query:limit"]?.source).toBe("#/components/parameters/Limit");
    expect(op?.requestBody).toMatchObject({ required: true, source: "#/components/requestBodies/Body" });
    expect(Object.keys(op?.requestBody?.content ?? {})).toEqual(["application/json;charset=utf-8"]);
    expect(op?.responses["200"]?.content["text/plain"]?.schema).toBeNull();
  });

  it("uses operation security, else the global default", async () => {
    const doc = {
      ...openapi({ "/a": { get: { responses: ok } }, "/b": { get: { security: [], responses: ok } } }),
      security: [{ oauth: ["write", "read", "read"] }, { apiKey: [] }],
    };
    const spec = await ingestObject(doc);
    expect(spec.ir.operations["GET /a"]?.security).toEqual([{ apiKey: [] }, { oauth: ["read", "write"] }]);
    expect(spec.ir.operations["GET /b"]?.security).toEqual([]);
  });

  it("warns about undeclared path parameters", async () => {
    const reader = memoryReader({
      "/s/o.yaml": stringify(
        openapi({
          "/a/{id}": {
            get: { parameters: [{ name: "other", in: "path", required: true, schema: {} }], responses: ok },
          },
        })
      ),
    });
    const result = await ingestSpec("/s/o.yaml", { reader });
    expect(result.spec).toBeDefined();
    expect(result.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ["warning", "PATH_PARAM_UNDECLARED"],
      ["warning", "PATH_PARAM_UNDECLARED"],
    ]);
  });

  it("accepts the same template with disjoint methods (a warning), but not the same operation twice", async () => {
    const disjoint = memoryReader({
      "/s/o.yaml": stringify(
        openapi({ "/a/{x}": { get: { responses: ok } }, "/a/{y}": { delete: { responses: ok } } })
      ),
    });
    const accepted = await ingestSpec("/s/o.yaml", { reader: disjoint });
    expect(Object.keys(accepted.spec?.ir.operations ?? {}).sort()).toEqual(["DELETE /a/{}", "GET /a/{}"]);
    expect(accepted.diagnostics.map((d) => d.code)).toContain("PATH_TEMPLATE_CONFLICT");

    const clash = memoryReader({
      "/s/o.yaml": stringify(openapi({ "/a/{x}": { get: { responses: ok } }, "/a/{y}": { get: { responses: ok } } })),
    });
    const rejected = await ingestSpec("/s/o.yaml", { reader: clash });
    expect(rejected.spec).toBeUndefined();
    expect(rejected.diagnostics.some((d) => d.severity === "error" && d.code === "PATH_TEMPLATE_CONFLICT")).toBe(true);
  });

  it("reports references that point to nothing", async () => {
    const reader = memoryReader({
      "/s/o.yaml": stringify(
        openapi({ "/a": { get: { parameters: [{ $ref: "#/components/parameters/Nope" }], responses: ok } } })
      ),
    });
    const result = await ingestSpec("/s/o.yaml", { reader });
    expect(result.spec).toBeUndefined();
    expect(result.diagnostics).toMatchObject([{ code: "REF_NOT_FOUND", line: expect.any(Number) as unknown }]);
  });

  it("reports circular reference chains", async () => {
    const reader = memoryReader({
      "/s/o.yaml": stringify(
        openapi(
          { "/a": { get: { responses: { "200": { $ref: "#/components/responses/A" } } } } },
          { responses: { A: { $ref: "#/components/responses/B" }, B: { $ref: "#/components/responses/A" } } }
        )
      ),
    });
    const result = await ingestSpec("/s/o.yaml", { reader });
    expect(result.diagnostics.map((d) => d.code)).toContain("REF_NOT_FOUND");
  });

  it("rejects $ref fragments that are not JSON pointers", async () => {
    const reader = memoryReader({
      "/s/o.yaml": stringify(
        openapi({
          "/a": {
            get: { responses: { "200": { description: "ok", content: { "a/b": { schema: { $ref: "#anchor" } } } } } },
          },
        })
      ),
    });
    const result = await ingestSpec("/s/o.yaml", { reader });
    expect(result.diagnostics.map((d) => d.code)).toEqual(["REF_UNSUPPORTED"]);
  });
});

describe("helpers", () => {
  it("normalises media types", () => {
    expect(normalizeMediaType("Application/JSON; Charset=UTF-8")).toBe("application/json;charset=utf-8");
  });

  it("sorts and de-duplicates security alternatives", () => {
    expect(normalizeSecurity([{ b: [] }, { a: ["y", "x"] }, { b: [] }, "junk"])).toEqual([
      { a: ["x", "y"] },
      { b: [] },
    ]);
    expect(normalizeSecurity(undefined)).toEqual([]);
  });
});

describe("basePaths", () => {
  it("takes the path of each server URL, with variable defaults, and defaults to the root", () => {
    expect(basePaths(undefined)).toEqual([""]);
    expect(
      basePaths([
        { url: "https://api.example.com/v1/" },
        { url: "//cdn.example.com/static?x=1" },
        { url: "/{version}/api", variables: { version: { default: "v2" } } },
        { url: "relative/{unknown}" },
        { url: "https://example.com" },
        { description: "no url" },
        "junk",
      ])
    ).toEqual(["", "/relative/{unknown}", "/static", "/v1", "/v2/api"]);
  });
});
