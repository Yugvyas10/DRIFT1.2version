import { describe, expect, it } from "vitest";
import { ingestObject, openapi } from "../testing/specs.ts";
import { ContractChecker } from "./contract.ts";

const pet = {
  type: "object",
  required: ["id", "status"],
  additionalProperties: false,
  properties: { id: { type: "integer" }, status: { type: "string", enum: ["available", "sold"] } },
};
const problem = { type: "object", required: ["title"], properties: { title: { type: "string" } } };
const document = openapi({
  "/pets": {
    post: {
      parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8 } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          },
        },
      },
      responses: {
        "201": { description: "created", content: { "application/json": { schema: pet } } },
        "4XX": { description: "error", content: { "application/problem+json": { schema: problem } } },
      },
    },
  },
  "/pets/{petId}": {
    get: {
      parameters: [
        { name: "petId", in: "path", required: true, schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer", maximum: 10 } },
      ],
      responses: { "200": { description: "ok", content: { "application/json": { schema: pet } } } },
    },
    delete: {
      parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
      responses: { "204": { description: "gone" } },
    },
  },
});

const checker = async () => new ContractChecker((await ingestObject(document)).ir);
const json = { "Content-Type": "application/json" };

describe("ContractChecker", () => {
  it("accepts exchanges that follow the contract", async () => {
    const contract = await checker();
    expect(
      contract.check({
        method: "post",
        path: "/pets",
        headers: { ...json, "Idempotency-Key": "abcdefgh" },
        requestBody: { name: "Rex" },
        status: 201,
        responseHeaders: json,
        responseBody: { id: 1, status: "available" },
      })
    ).toEqual([]);
    expect(
      contract.check({
        method: "GET",
        path: "/pets/7?limit=5",
        status: 200,
        responseHeaders: json,
        responseBody: { id: 7, status: "sold" },
      })
    ).toEqual([]);
    expect(contract.check({ method: "DELETE", path: "/pets/7", status: 204 })).toEqual([]);
    // A request alone (no status) checks the request side only.
    expect(contract.check({ method: "GET", path: "/pets/7" })).toEqual([]);
    // A status range in the contract (4XX) documents every status in it.
    expect(
      contract.check({
        method: "POST",
        path: "/pets",
        headers: { ...json, "Idempotency-Key": "abcdefgh" },
        requestBody: { name: "Rex" },
        status: 409,
        responseHeaders: { "Content-Type": "application/problem+json; charset=utf-8" },
        responseBody: { title: "Conflict" },
      })
    ).toEqual([]);
  });

  it("reports a request the contract rejects", async () => {
    const contract = await checker();
    expect(contract.check({ method: "PUT", path: "/pets" })).toEqual([
      { side: "request", pointer: "/path", message: "PUT /pets is not in the contract" },
    ]);
    const bad = contract.check({ method: "POST", path: "/pets", headers: json, requestBody: { name: 5 } });
    expect(bad.map((p) => `${p.side} ${p.pointer}`)).toEqual([
      "request /headers/idempotency-key",
      "request /body/name",
    ]);
    expect(contract.check({ method: "GET", path: "/pets/7?limit=50" })).toMatchObject([
      { side: "request", pointer: "/query/limit" },
    ]);
  });

  it("reports a response the contract does not document or whose body it rejects", async () => {
    const contract = await checker();
    const get = { method: "GET", path: "/pets/7" };
    expect(contract.check({ ...get, status: 500 })).toEqual([
      { side: "response", pointer: "/response/status", message: "status 500 is not documented for GET /pets/{}" },
    ]);
    expect(contract.check({ ...get, status: 200 })).toEqual([
      { side: "response", pointer: "/response/body", message: "status 200 documents a body, but none was sent" },
    ]);
    expect(
      contract.check({
        ...get,
        status: 200,
        responseHeaders: { "Content-Type": "text/html" },
        responseBody: "<p>hi</p>",
      })
    ).toEqual([
      {
        side: "response",
        pointer: "/response/headers/content-type",
        message: "media type text/html is not documented for status 200",
      },
    ]);
    const wrong = contract.check({
      ...get,
      status: 200,
      responseHeaders: json,
      responseBody: { id: "7", status: "lost", extra: true },
    });
    expect(wrong.map((p) => p.pointer).sort()).toEqual([
      "/response/body/extra",
      "/response/body/id",
      "/response/body/status",
    ]);
    expect(wrong.every((p) => p.side === "response")).toBe(true);
  });
});
