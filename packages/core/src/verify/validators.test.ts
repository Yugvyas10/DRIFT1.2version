import { describe, expect, it } from "vitest";
import type { SpecIR } from "../ingest/ir.ts";
import { ingestObject, openapi } from "../testing/specs.ts";
import { Validators } from "./validators.ts";
import { fromWire, resolveSchema, toWire, typesOf } from "./wire.ts";

const empty: SpecIR = {
  irVersion: 1,
  oasVersion: "3.1.0",
  info: { title: "", version: "" },
  basePaths: [""],
  operations: {},
  schemas: {},
};

async function petSpec() {
  const pet = {
    type: "object",
    required: ["id", "name", "password"],
    properties: {
      id: { type: "integer", readOnly: true },
      name: { type: "string", pattern: "^[a-z\\-]+$" },
      password: { $ref: "#/components/schemas/Secret" },
      friend: { $ref: "#/components/schemas/Pet" },
      kind: { oneOf: [{ $ref: "#/components/schemas/Secret" }], discriminator: { propertyName: "x" } },
    },
  };
  const body = { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } };
  return (
    await ingestObject(
      openapi(
        {
          "/pets": {
            post: {
              requestBody: body,
              responses: { "200": { description: "ok", ...body } },
            },
          },
        },
        { schemas: { Pet: pet, Secret: { type: "string", writeOnly: true, format: "password" } } }
      )
    )
  ).ir;
}

describe("Validators", () => {
  it("compiles each validator once per key and reuses it", async () => {
    const spec = await petSpec();
    const validators = new Validators(spec);
    const schema = spec.operations["POST /pets"]?.requestBody?.content["application/json"]?.schema ?? {};
    const first = validators.get("request", "POST /pets|body", schema);
    const again = validators.get("request", "POST /pets|body", schema);
    expect(again).toBe(first);
    expect(validators.compiled).toBe(1);
    validators.get("response", "POST /pets|body", schema);
    expect(validators.compiled).toBe(2);
  });

  it("does not require readOnly properties in requests or writeOnly ones in responses", async () => {
    const spec = await petSpec();
    const validators = new Validators(spec);
    const schema = { $ref: "#/components/schemas/Pet", $source: "#/test" };
    const request = validators.get("request", "k", schema);
    const response = validators.get("response", "k", schema);
    expect(request?.({ name: "rex", password: "x" })).toEqual({ valid: true });
    expect(response?.({ id: 1, name: "rex" })).toEqual({ valid: true });
    const failed = request?.({ name: "Rex!" });
    expect(failed?.valid).toBe(false);
    if (failed?.valid !== false) return;
    expect(failed.errors.map((error) => [error.keyword, (error.parentSchema as { $source?: string }).$source])).toEqual(
      [
        ["required", "#/components/schemas/Pet"],
        ["pattern", "#/components/schemas/Pet/properties/name"],
      ]
    );
  });

  it("records schemas that cannot be compiled instead of throwing", () => {
    const validators = new Validators(empty);
    expect(validators.get("request", "bad", { type: ["string"], pattern: "(" })).toBeUndefined();
    expect(validators.get("request", "bad", { type: ["string"], pattern: "(" })).toBeUndefined();
    expect(validators.compiled).toBe(0);
    expect([...validators.failures.keys()]).toEqual(["request\0bad"]);
  });

  it("treats a reference to a missing component as any value", () => {
    const validators = new Validators(empty);
    expect(validators.get("request", "k", { $ref: "#/components/schemas/Gone" })?.(42)).toEqual({ valid: true });
  });
});

describe("wire values", () => {
  it("decodes text into the types the schema asks for", () => {
    expect(fromWire(["42"], { type: ["integer"] }, empty)).toBe(42);
    expect(fromWire(["4.5e1"], { type: ["number"] }, empty)).toBe(45);
    expect(fromWire(["042"], { type: ["integer"] }, empty)).toBe("042");
    expect(fromWire(["true"], { type: ["boolean"] }, empty)).toBe(true);
    expect(fromWire(["yes"], { type: ["boolean"] }, empty)).toBe("yes");
    expect(fromWire([""], { type: ["null"] }, empty)).toBeNull();
    expect(fromWire(["7"], { type: ["string", "integer"] }, empty)).toBe("7");
    expect(fromWire(["7"], {}, empty)).toBe("7");
    expect(fromWire(["1", "2"], { type: ["array"], items: { type: ["integer"] } }, empty)).toEqual([1, 2]);
    expect(fromWire(["1,x"], { type: ["array"], items: { type: ["integer"] } }, empty)).toEqual([1, "x"]);
    expect(fromWire(["a,b"], { type: ["array"] }, empty)).toEqual(["a", "b"]);
    expect(fromWire([], { type: ["integer"] }, empty)).toBe("");
  });

  it("infers types from enum and const, and follows references", () => {
    const spec: SpecIR = { ...empty, schemas: { A: { $ref: "B" }, B: { enum: [1, "x", null, [1]] } } };
    expect(typesOf({ $ref: "A" }, spec)).toEqual(["number", "string", "null", "array"]);
    expect(typesOf({ const: true }, spec)).toEqual(["boolean"]);
    expect(typesOf({ $ref: "Missing" }, spec)).toBeUndefined();
    expect(typesOf({ description: "x" }, spec)).toBeUndefined();
    expect(resolveSchema({ $ref: "A" }, spec)).toEqual({ enum: [1, "x", null, [1]] });
  });

  it("encodes generated values, except objects", () => {
    expect(toWire("a")).toEqual(["a"]);
    expect(toWire(3)).toEqual(["3"]);
    expect(toWire(null)).toEqual([""]);
    expect(toWire([1, true])).toEqual(["1", "true"]);
    expect(toWire({ a: 1 })).toBeUndefined();
    expect(toWire([{ a: 1 }])).toBeUndefined();
  });
});
