import type { Change, ChangeKind } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import type { Anchor, Slot } from "../diff/anchors.ts";
import { explains, type Failure } from "./attribution.ts";

const slot: Slot = { part: "body", mediaType: "application/json" };
const node = "#/components/schemas/Pet";
const anchor: Anchor = { at: "schema", slot, nodes: { base: "#/base/Pet", head: node } };

function change(kind: ChangeKind, subject?: string): Change {
  return {
    id: "0123456789abcdef",
    kind,
    direction: "request",
    operation: "POST /pets",
    location: node,
    side: "head",
    candidateSeverity: "RISKY",
    message: kind,
    ...(subject === undefined ? {} : { subject }),
  };
}

function schema(keyword: string, overrides: Partial<Extract<Failure, { at: "schema" }>> = {}): Failure {
  return { at: "schema", slot, node, keyword, params: {}, value: null, pointer: "/body", message: "", ...overrides };
}

const yes = (c: Change, f: Failure, a: Anchor = anchor) => {
  expect(explains(c, a, f, "head")).toBe(true);
};
const no = (c: Change, f: Failure, a: Anchor = anchor) => {
  expect(explains(c, a, f, "head")).toBe(false);
};

describe("explains: schema failures", () => {
  it("matches property changes by the missing or extra property name", () => {
    yes(change("schema.property.added.required", "tag"), schema("required", { params: { missingProperty: "tag" } }));
    no(change("schema.property.added.required", "tag"), schema("required", { params: { missingProperty: "id" } }));
    yes(
      change("schema.property.removed", "tag"),
      schema("additionalProperties", { params: { additionalProperty: "tag" } })
    );
    no(change("schema.property.removed", "tag"), schema("type"));
  });

  it("matches types, formats and enum values by keyword and value", () => {
    yes(change("schema.type.narrowed"), schema("type"));
    no(change("schema.type.changed"), schema("format"));
    yes(change("schema.format.changed"), schema("format"));
    yes(change("schema.enum.value_removed", '"b"'), schema("enum", { value: "b" }));
    yes(change("schema.enum.value_added", "1"), schema("const", { value: 1 }));
    no(change("schema.enum.value_removed", '"b"'), schema("enum", { value: "c" }));
  });

  it("matches bounds by the keyword that changed, and item constraints below the node", () => {
    yes(change("schema.bound.tightened", "maximum"), schema("maximum"));
    no(change("schema.bound.tightened", "maximum"), schema("minimum"));
    yes(change("schema.bound.tightened", "enum"), schema("enum"));
    yes(change("schema.bound.relaxed", "items"), schema("type", { node: `${node}/items` }));
    no(change("schema.bound.tightened", "items"), schema("type"));
  });

  it("matches additional properties, variants and compositions", () => {
    yes(change("schema.additional_properties.tightened"), schema("unevaluatedProperties"));
    yes(change("schema.variant.removed", "oneOf"), schema("oneOf"));
    no(change("schema.variant.removed", "oneOf"), schema("anyOf"));
    yes(change("schema.composition.changed", "allOf"), schema("required", { node: `${node}/allOf/0` }));
    yes(change("schema.composition.changed", "prefixItems"), schema("maxItems"));
    no(change("schema.composition.changed", "prefixItems"), schema("type"));
    yes(change("schema.composition.changed", "not"), schema("not"));
  });

  it("never attributes to changes validation cannot prove", () => {
    for (const kind of ["schema.default.changed", "schema.discriminator.changed", "doc.changed"] as const) {
      no(change(kind), schema("type"));
    }
  });

  it("requires the same slot and the node on the side being validated", () => {
    no(change("schema.type.narrowed"), schema("type", { slot: { part: "param", key: "query:x" } }));
    no(change("schema.type.narrowed"), schema("type", { node: "#/elsewhere" }));
    expect(explains(change("schema.type.narrowed"), anchor, schema("type", { node: "#/base/Pet" }), "base")).toBe(true);
    no(change("schema.type.narrowed"), schema("type"), { at: "body" });
  });
});

describe("explains: operation, parameter, body and media failures", () => {
  const base = { pointer: "/x", keyword: "required", message: "" };
  it("attributes a missing operation to its removal", () => {
    yes(change("operation.removed"), { ...base, at: "operation" }, { at: "operation" });
    yes(change("path.removed"), { ...base, at: "operation" }, { at: "operation" });
    no(change("operation.deprecated"), { ...base, at: "operation" }, { at: "operation" });
  });

  it("attributes a missing parameter to the change on that parameter", () => {
    const failure: Failure = { ...base, at: "param", key: "query:q" };
    yes(change("param.added.required"), failure, { at: "param", key: "query:q" });
    yes(change("param.location_changed"), failure, { at: "param", key: "query:q" });
    no(change("param.added.required"), failure, { at: "param", key: "query:other" });
    no(change("param.removed"), failure, { at: "param", key: "query:q" });
  });

  it("attributes a missing body and an unaccepted media type", () => {
    yes(change("request.body.made_required"), { ...base, at: "body" }, { at: "body" });
    no(change("request.body.removed"), { ...base, at: "body" }, { at: "body" });
    const media: Failure = { ...base, at: "media", mediaType: "text/plain" };
    yes(change("media_type.removed"), media, { at: "media", part: "body", mediaType: "text/plain" });
    no(change("media_type.removed"), media, { at: "media", part: "body", mediaType: "application/json" });
    no(change("media_type.removed"), media, {
      at: "media",
      part: "response",
      status: "200",
      mediaType: "text/plain",
    });
  });
});
