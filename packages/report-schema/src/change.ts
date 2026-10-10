import { z } from "zod";
import { Direction } from "./vocabulary.ts";

/**
 * Every kind of structural change the diff stage reports (PLAN §4.2).
 * The structural default for each kind and direction lives in @drift/rules as data (ADR-0005).
 */
export const CHANGE_KINDS = [
  // Paths and operations (reported in the request direction: clients call them)
  "path.added",
  "path.removed",
  "operation.added",
  "operation.removed",
  "operation.deprecated",
  "path.param.renamed",
  // Parameters
  "param.added.required",
  "param.added.optional",
  "param.removed",
  "param.made_required",
  "param.made_optional",
  "param.location_changed",
  "param.deprecated",
  // Request body
  "request.body.added.required",
  "request.body.added.optional",
  "request.body.removed",
  "request.body.made_required",
  "request.body.made_optional",
  // Media types (request or response)
  "media_type.added",
  "media_type.removed",
  // Responses
  "response.status.added",
  "response.error_status.added",
  "response.status.removed",
  // Schemas (request or response)
  "schema.property.added.required",
  "schema.property.added.optional",
  "schema.property.removed",
  "schema.property.made_required",
  "schema.property.made_optional",
  "schema.type.narrowed",
  "schema.type.widened",
  "schema.type.changed",
  "schema.format.changed",
  "schema.enum.value_added",
  "schema.enum.value_removed",
  "schema.bound.tightened",
  "schema.bound.relaxed",
  "schema.additional_properties.tightened",
  "schema.additional_properties.relaxed",
  "schema.variant.added",
  "schema.variant.removed",
  "schema.composition.changed",
  "schema.discriminator.changed",
  "schema.default.changed",
  "schema.deprecated",
  // Security
  "security.requirement.added",
  "security.requirement.removed",
  // Documentation only
  "doc.changed",
] as const;

export const ChangeKind = z.enum(CHANGE_KINDS);
export type ChangeKind = z.infer<typeof ChangeKind>;

/** The structural judgement made before any evidence exists: dangerous changes start as RISKY. */
export const CandidateSeverity = z.enum(["RISKY", "SAFE"]);
export type CandidateSeverity = z.infer<typeof CandidateSeverity>;

/**
 * One structural difference between two contracts.
 *
 * `location` is a URI reference relative to the root spec: `#/json/pointer` inside the root document,
 * or `relative/file.yaml#/json/pointer` inside a referenced file. `side` says which contract it points into.
 */
export const Change = z.object({
  /** Stable id: the first 16 hex digits of SHA-256 over kind, direction, operation, location and subject. */
  id: z.string().regex(/^[0-9a-f]{16}$/),
  kind: ChangeKind,
  direction: Direction,
  /** Normalised operation key, e.g. `POST /users/{}`. */
  operation: z.string(),
  location: z.string(),
  side: z.enum(["base", "head"]),
  /** What changed at the location when that is not already in it, e.g. an enum value or a keyword name. */
  subject: z.string().optional(),
  before: z.json().optional(),
  after: z.json().optional(),
  candidateSeverity: CandidateSeverity,
  message: z.string(),
});
export type Change = z.infer<typeof Change>;
