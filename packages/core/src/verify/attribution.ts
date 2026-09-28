import type { Change, ChangeKind } from "@drift/report-schema";
import { canonicalJson } from "../hash/canonical-json.ts";
import { sameSlot, type Anchor, type Slot } from "../diff/anchors.ts";

/**
 * Why a sample fails under a contract, located in the sample (see sample.ts for the pointer namespace).
 * Schema failures carry the source of the contract node that rejected the value, which is what ties
 * them to changes: every schema change records the pair of nodes it was found at (anchors.ts).
 */
export type Failure = { pointer: string; keyword: string; message: string } & (
  | { at: "operation" }
  | { at: "param"; key: string }
  | { at: "body" }
  | { at: "media"; mediaType: string }
  | { at: "schema"; slot: Slot; node: string; params: Record<string, unknown>; value: unknown }
);

const MISSING_PARAM: ReadonlySet<ChangeKind> = new Set([
  "param.added.required",
  "param.made_required",
  "param.location_changed",
]);
const MISSING_BODY: ReadonlySet<ChangeKind> = new Set(["request.body.added.required", "request.body.made_required"]);
const PROPERTY_KINDS: ReadonlySet<ChangeKind> = new Set([
  "schema.property.added.required",
  "schema.property.added.optional",
  "schema.property.removed",
  "schema.property.made_required",
  "schema.property.made_optional",
]);

function param(failure: { params: Record<string, unknown> }, name: string): unknown {
  return failure.params[name];
}

/** Whether a schema validation failure at `node` is explained by `change`, found at node `anchorNode`. */
function explainsSchema(change: Change, anchorNode: string, failure: Extract<Failure, { at: "schema" }>): boolean {
  const { kind, subject } = change;
  const { keyword } = failure;
  const here = failure.node === anchorNode;
  const below = (suffix: string) => failure.node.startsWith(`${anchorNode}/${suffix}`);
  if (PROPERTY_KINDS.has(kind)) {
    return (
      here &&
      ((keyword === "required" && param(failure, "missingProperty") === subject) ||
        (keyword === "additionalProperties" && param(failure, "additionalProperty") === subject))
    );
  }
  switch (kind) {
    case "schema.type.narrowed":
    case "schema.type.widened":
    case "schema.type.changed":
      return here && keyword === "type";
    case "schema.format.changed":
      return here && keyword === "format";
    case "schema.enum.value_removed":
    case "schema.enum.value_added":
      return here && (keyword === "enum" || keyword === "const") && canonicalJson(failure.value) === subject;
    case "schema.bound.tightened":
    case "schema.bound.relaxed":
      if (subject === "items") return below("items");
      if (subject === "enum" || subject === "const") return here && (keyword === "enum" || keyword === "const");
      return here && keyword === subject;
    case "schema.additional_properties.tightened":
    case "schema.additional_properties.relaxed":
      return here && (keyword === "additionalProperties" || keyword === "unevaluatedProperties");
    case "schema.variant.added":
    case "schema.variant.removed":
      return here && keyword === subject;
    case "schema.composition.changed":
      if (subject === "allOf") return below("allOf");
      if (subject === "prefixItems") {
        return here && ["prefixItems", "items", "minItems", "maxItems"].includes(keyword);
      }
      return here && keyword === subject;
    default:
      // discriminator, default, deprecated and documentation changes cannot be proven by validation.
      return false;
  }
}

/** Whether `failure` (found validating against the `side` contract) is explained by `change` at `anchor`. */
export function explains(change: Change, anchor: Anchor, failure: Failure, side: "base" | "head"): boolean {
  switch (failure.at) {
    case "operation":
      return anchor.at === "operation" && (change.kind === "path.removed" || change.kind === "operation.removed");
    case "param":
      return anchor.at === "param" && anchor.key === failure.key && MISSING_PARAM.has(change.kind);
    case "body":
      return anchor.at === "body" && MISSING_BODY.has(change.kind);
    case "media":
      return (
        anchor.at === "media" &&
        anchor.part === "body" &&
        anchor.mediaType === failure.mediaType &&
        change.kind === "media_type.removed"
      );
    case "schema":
      return (
        anchor.at === "schema" &&
        sameSlot(anchor.slot, failure.slot) &&
        explainsSchema(change, anchor.nodes[side], failure)
      );
  }
}
