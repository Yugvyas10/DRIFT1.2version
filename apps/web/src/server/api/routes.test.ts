import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ingestSpec } from "@drift/core";
import { describe, expect, it } from "vitest";
import type { Api } from "./handlers";
import { dispatch, ROUTES } from "./routes";

const contractFile = fileURLToPath(new URL("../../../openapi/drift-api.yaml", import.meta.url));

/** An Api whose every handler answers with its own name and params, to see where a request is dispatched. */
const echo = new Proxy({} as Api, {
  get: (_, name) => (_request: Request, params?: Record<string, string>) =>
    Promise.resolve(new Response(JSON.stringify({ handler: name, params: params ?? {} }))),
});

const request = (method: string, path: string) => new Request(`http://drift.test${path}`, { method });

describe("ROUTES", () => {
  it("has exactly the operations of drift-api.yaml: same operationId, method and path", async () => {
    const result = await ingestSpec(contractFile, {
      reader: {
        size: async (path) => (await stat(path)).size,
        readText: (path) => readFile(path, "utf8"),
        realpath: (path) => realpath(path),
      },
    });
    if (!result.spec) throw new Error("the contract is invalid");
    const documented = Object.values(result.spec.ir.operations)
      .map((operation) => `${operation.operationId ?? "?"} ${operation.method.toUpperCase()} ${operation.path}`)
      .sort();
    const routed = ROUTES.map((route) => `${route.operation} ${route.method} ${route.path}`).sort();
    expect(routed).toEqual(documented);
  });
});

describe("dispatch", () => {
  it("passes decoded path parameters to the handler", async () => {
    const response = await dispatch(echo, request("DELETE", "/api/v1/orgs/acme/keys/key_abc"));
    expect(await response.json()).toEqual({ handler: "revokeKey", params: { org: "acme", keyId: "key_abc" } });
    const encoded = await dispatch(echo, request("GET", "/api/v1/projects/a%2Fb/runs/"));
    expect(await encoded.json()).toEqual({ handler: "listRuns", params: { project: "a/b" } });
  });

  it("answers 404 for an unknown path and 405 with Allow for a known path and another method", async () => {
    for (const path of ["/api/v1/nope", "/api/v1/orgs//keys", "/api/v1/orgs/%E0%A4%A/keys", "/api/v1/runs/a/b/c/d/e"]) {
      expect((await dispatch(echo, request("GET", path))).status).toBe(404);
    }
    const wrong = await dispatch(echo, request("PUT", "/api/v1/orgs"));
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET, POST");
  });
});
