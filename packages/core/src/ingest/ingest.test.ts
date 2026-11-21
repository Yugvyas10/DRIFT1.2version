import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { memoryReader } from "../testing/memory-reader.ts";
import { openapi } from "../testing/specs.ts";
import { ingestSpec } from "./ingest.ts";

const document = openapi(
  {
    "/pets": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
        },
      },
    },
  },
  {
    schemas: {
      Pet: { type: "object", required: ["id"], properties: { id: { type: "integer" }, name: { type: "string" } } },
    },
  }
);

function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reversedKeys(v)])
    );
  return value;
}

describe("ingestSpec", () => {
  it("gives YAML and JSON, in any key order, the same spec hash", async () => {
    const reader = memoryReader({
      "/s/a.yaml": stringify(document),
      "/s/b.json": JSON.stringify(reversedKeys(document), null, 2),
    });
    const a = await ingestSpec("/s/a.yaml", { reader });
    const b = await ingestSpec("/s/b.json", { reader });
    expect(a.spec?.specHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.spec?.specHash).toBe(b.spec?.specHash);
  });

  it("changes the hash when the contract changes", async () => {
    const changed = structuredClone(document);
    (changed.components as { schemas: { Pet: { required: string[] } } }).schemas.Pet.required = ["id", "name"];
    const reader = memoryReader({ "/s/a.yaml": stringify(document), "/s/b.yaml": stringify(changed) });
    const a = await ingestSpec("/s/a.yaml", { reader });
    const b = await ingestSpec("/s/b.yaml", { reader });
    expect(a.spec?.specHash).not.toBe(b.spec?.specHash);
  });

  it("summarises the spec", async () => {
    const reader = memoryReader({ "/s/a.yaml": stringify(document) });
    const { spec, diagnostics } = await ingestSpec("/s/a.yaml", { reader });
    expect(diagnostics).toEqual([]);
    expect(spec).toMatchObject({
      file: "/s/a.yaml",
      oasVersion: "3.0.3",
      line: "3.0",
      ir: { info: { title: "Test", version: "1" } },
    });
    expect(Object.keys(spec?.ir.schemas ?? {})).toEqual(["#/components/schemas/Pet"]);
  });

  it("only keeps components that operations actually reach", async () => {
    const withUnused = openapi(
      { "/a": { get: { responses: { "200": { description: "ok" } } } } },
      { schemas: { Unused: { type: "string" } } }
    );
    const reader = memoryReader({ "/s/a.yaml": stringify(withUnused) });
    expect((await ingestSpec("/s/a.yaml", { reader })).spec?.ir.schemas).toEqual({});
  });

  it("sorts diagnostics by file and position", async () => {
    const reader = memoryReader({
      "/s/a.yaml": stringify(
        openapi({ "/b": { get: { responses: { "200": {} } } }, "/a": { get: { responses: { "200": {} } } } })
      ),
    });
    const { diagnostics } = await ingestSpec("/s/a.yaml", { reader });
    const lines = diagnostics.map((d) => d.line ?? 0);
    expect(lines).toEqual([...lines].sort((x, y) => x - y));
  });

  it("never throws on arbitrary text: every outcome is a result", async () => {
    const samples = [
      "",
      "null",
      "42",
      "[]",
      "{",
      "a: [",
      "- - -",
      "openapi: 3.0.3\npaths: 7",
      "\u0000\u0001",
      "%YAML 9.9\n---\na: 1",
    ];
    for (const text of samples) {
      const reader = memoryReader({ "/s/a.yaml": text });
      const result = await ingestSpec("/s/a.yaml", { reader });
      expect(result.spec).toBeUndefined();
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });
});
