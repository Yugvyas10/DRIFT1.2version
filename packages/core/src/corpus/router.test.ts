import { describe, expect, it } from "vitest";
import { ingestObject, openapi } from "../testing/specs.ts";
import { Router } from "./router.ts";

const ok = { responses: { "200": { description: "ok" } } };
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

async function router(servers?: unknown[]) {
  const document = openapi({
    "/users/me": { get: ok },
    "/users/{id}": { parameters: [idParam], get: ok, delete: ok },
    "/users/{id}/files/{name}.json": {
      parameters: [idParam, { name: "name", in: "path", required: true, schema: { type: "string" } }],
      get: ok,
    },
    "/": { get: ok },
  });
  const spec = await ingestObject(servers ? { ...document, servers } : document);
  return new Router(spec.ir);
}

describe("Router", () => {
  it("prefers literal segments over parameters and decodes parameter values", async () => {
    const r = await router();
    expect(r.match("GET", "/users/me")).toEqual({ operation: "GET /users/me", pathParams: [] });
    expect(r.match("get", "/users/a%20b")).toEqual({ operation: "GET /users/{}", pathParams: ["a b"] });
    expect(r.match("DELETE", "/users/me")).toEqual({ operation: "DELETE /users/{}", pathParams: ["me"] });
    expect(r.match("GET", "/")).toEqual({ operation: "GET /", pathParams: [] });
  });

  it("matches segments that mix text and parameters, and tolerates a trailing slash", async () => {
    const r = await router();
    expect(r.match("GET", "/users/7/files/report.json/")).toEqual({
      operation: "GET /users/{}/files/{}.json",
      pathParams: ["7", "report"],
    });
    expect(r.match("GET", "/users/7/files/report.xml")).toBeUndefined();
  });

  it("returns nothing for unknown paths, methods or empty parameter values", async () => {
    const r = await router();
    expect(r.match("POST", "/users/me")).toBeUndefined();
    expect(r.match("GET", "/nope")).toBeUndefined();
    expect(r.match("GET", "/users//files/x.json")).toBeUndefined();
    expect(r.match("GET", "/users/%E0%A4%A")).toEqual({ operation: "GET /users/{}", pathParams: ["%E0%A4%A"] });
  });

  it("strips server base paths, longest first, and only at segment boundaries", async () => {
    const r = await router([
      { url: "https://api.example.com/api" },
      { url: "https://api.example.com/api/{version}", variables: { version: { default: "v2" } } },
    ]);
    expect(r.match("GET", "/api/v2/users/me")).toEqual({ operation: "GET /users/me", pathParams: [] });
    expect(r.match("GET", "/api/users/me")).toEqual({ operation: "GET /users/me", pathParams: [] });
    expect(r.match("GET", "/apiusers/me")).toBeUndefined();
    expect(r.match("GET", "/users/me")).toBeUndefined();
  });
});
