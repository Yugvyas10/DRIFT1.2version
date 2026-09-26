import { describe, expect, it } from "vitest";
import { memoryReader } from "../testing/memory-reader.ts";
import { loadDocumentSet } from "./documents.ts";
import { locationOf, resolveRef } from "./refs.ts";

async function load(files: Record<string, string>) {
  const { set } = await loadDocumentSet("/s/openapi.yaml", { reader: memoryReader(files) });
  if (!set) throw new Error("root failed to load");
  return set;
}

describe("resolveRef", () => {
  it("resolves internal and cross-file references to stable ids", async () => {
    const set = await load({
      "/s/openapi.yaml": "a:\n  $ref: ./schemas/pet.yaml#/Pet\nb: {c: 1}\n",
      "/s/schemas/pet.yaml": "Pet: {type: object}\n",
    });
    const internal = resolveRef(set, set.root, "#/b/c");
    expect(internal).toMatchObject({ ok: true, target: { id: "#/b/c", value: 1 } });
    const external = resolveRef(set, set.root, "./schemas/pet.yaml#/Pet");
    expect(external).toMatchObject({ ok: true, target: { id: "schemas/pet.yaml#/Pet", value: { type: "object" } } });
    const whole = resolveRef(set, set.root, "./schemas/pet.yaml");
    expect(whole).toMatchObject({ ok: true, target: { id: "schemas/pet.yaml#" } });
  });

  it("reports references into files that did not load, pointers to nothing, and anchors", async () => {
    const set = await load({ "/s/openapi.yaml": "a:\n  $ref: ./broken.yaml#/X\n", "/s/broken.yaml": "X: [\n" });
    expect(resolveRef(set, set.root, "./broken.yaml#/X")).toMatchObject({ ok: false, code: "REF_NOT_FOUND" });
    expect(resolveRef(set, set.root, "./never-mentioned.yaml")).toMatchObject({ ok: false, code: "REF_NOT_FOUND" });
    expect(resolveRef(set, set.root, "#/nope")).toMatchObject({ ok: false, code: "REF_NOT_FOUND" });
    expect(resolveRef(set, set.root, "#pet")).toMatchObject({ ok: false, code: "REF_UNSUPPORTED" });
  });

  it("formats locations as URI references relative to the root spec", async () => {
    const set = await load({ "/s/openapi.yaml": "a: 1\n" });
    expect(locationOf({ document: set.root, tokens: ["paths", "/pets/{id}"] })).toBe("#/paths/~1pets~1{id}");
  });
});
