import type { CandidateSeverity, ChangeKind, Direction } from "@drift/report-schema";

type Effect = "dangerous" | "safe";

/**
 * The structural default for each change kind in each direction (PLAN §4.2), before any evidence:
 * narrowing what the server accepts (request) or widening what it returns (response) is dangerous.
 *
 * This is data, not engine code (ADR-0005). "dangerous" starts a change as RISKY; only failing
 * evidence (M2) can make it BREAKING. Kinds that only occur in one direction still list both, so the
 * table is total and a test can check it against every kind.
 */
export const STRUCTURAL_DEFAULTS = {
  "path.added": { request: "safe", response: "safe" },
  "path.removed": { request: "dangerous", response: "dangerous" },
  "operation.added": { request: "safe", response: "safe" },
  "operation.removed": { request: "dangerous", response: "dangerous" },
  "operation.deprecated": { request: "safe", response: "safe" },
  "path.param.renamed": { request: "safe", response: "safe" },

  "param.added.required": { request: "dangerous", response: "dangerous" },
  "param.added.optional": { request: "safe", response: "safe" },
  "param.removed": { request: "dangerous", response: "dangerous" },
  "param.made_required": { request: "dangerous", response: "dangerous" },
  "param.made_optional": { request: "safe", response: "safe" },
  "param.location_changed": { request: "dangerous", response: "dangerous" },
  "param.deprecated": { request: "safe", response: "safe" },

  "request.body.added.required": { request: "dangerous", response: "dangerous" },
  "request.body.added.optional": { request: "safe", response: "safe" },
  "request.body.removed": { request: "dangerous", response: "dangerous" },
  "request.body.made_required": { request: "dangerous", response: "dangerous" },
  "request.body.made_optional": { request: "safe", response: "safe" },

  "media_type.added": { request: "safe", response: "dangerous" },
  "media_type.removed": { request: "dangerous", response: "dangerous" },

  "response.status.added": { request: "dangerous", response: "dangerous" },
  "response.error_status.added": { request: "safe", response: "safe" },
  "response.status.removed": { request: "dangerous", response: "dangerous" },

  "schema.property.added.required": { request: "dangerous", response: "safe" },
  "schema.property.added.optional": { request: "safe", response: "safe" },
  "schema.property.removed": { request: "dangerous", response: "dangerous" },
  "schema.property.made_required": { request: "dangerous", response: "safe" },
  "schema.property.made_optional": { request: "safe", response: "dangerous" },
  "schema.type.narrowed": { request: "dangerous", response: "safe" },
  "schema.type.widened": { request: "safe", response: "dangerous" },
  "schema.type.changed": { request: "dangerous", response: "dangerous" },
  "schema.format.changed": { request: "dangerous", response: "dangerous" },
  "schema.enum.value_added": { request: "safe", response: "dangerous" },
  "schema.enum.value_removed": { request: "dangerous", response: "safe" },
  "schema.bound.tightened": { request: "dangerous", response: "safe" },
  "schema.bound.relaxed": { request: "safe", response: "dangerous" },
  "schema.additional_properties.tightened": { request: "dangerous", response: "safe" },
  "schema.additional_properties.relaxed": { request: "safe", response: "dangerous" },
  "schema.variant.added": { request: "safe", response: "dangerous" },
  "schema.variant.removed": { request: "dangerous", response: "safe" },
  "schema.composition.changed": { request: "dangerous", response: "dangerous" },
  "schema.discriminator.changed": { request: "dangerous", response: "dangerous" },
  "schema.default.changed": { request: "dangerous", response: "safe" },
  "schema.deprecated": { request: "safe", response: "safe" },

  "security.requirement.added": { request: "dangerous", response: "dangerous" },
  "security.requirement.removed": { request: "safe", response: "safe" },

  "doc.changed": { request: "safe", response: "safe" },
} as const satisfies Record<ChangeKind, Record<Direction, Effect>>;

/** RISKY for a structurally dangerous change, SAFE otherwise. */
export function candidateSeverity(kind: ChangeKind, direction: Direction): CandidateSeverity {
  return STRUCTURAL_DEFAULTS[kind][direction] === "dangerous" ? "RISKY" : "SAFE";
}
