import { ChangeKind, Direction, FailOn } from "@drift/report-schema";
import { z } from "zod";
import { RuleId } from "./rule-id.ts";

export const POLICY_FORMAT = "drift-policy/v1";

/**
 * Raises the structural label of matching changes from SAFE to RISKY (e.g. "treat deprecations as RISKY").
 * A policy can only escalate: lowering a label needs a suppression, which has to give a reason and expire.
 */
export const Escalation = z
  .strictObject({
    kind: ChangeKind.optional(),
    direction: Direction.optional(),
    ruleId: RuleId.optional(),
    reason: z.string().min(1),
  })
  .refine((escalation) => escalation.kind !== undefined || escalation.ruleId !== undefined, {
    message: "An escalation needs a kind or a ruleId",
  });
export type Escalation = z.infer<typeof Escalation>;

/**
 * Accepts a known change: it stays in the report, marked as suppressed, but does not count towards the gate.
 * Matches one change id, or a rule optionally narrowed by operation and location (`*` matches any text).
 */
export const SuppressionRule = z
  .strictObject({
    changeId: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional(),
    ruleId: RuleId.optional(),
    operation: z.string().optional(),
    location: z.string().optional(),
    reason: z.string().min(10, "Give a reason of at least 10 characters"),
    expiresAt: z.iso.date(),
  })
  .refine((suppression) => suppression.changeId !== undefined || suppression.ruleId !== undefined, {
    message: "A suppression needs a changeId or a ruleId",
  });
export type SuppressionRule = z.infer<typeof SuppressionRule>;

export const Policy = z
  .strictObject({
    $schema: z.string().optional(),
    format: z.literal(POLICY_FORMAT),
    failOn: FailOn.optional(),
    /** Whether RISKY changes make the semver recommendation `major` (default true). */
    riskyIsMajor: z.boolean().optional(),
    escalate: z.array(Escalation).optional(),
    suppressions: z.array(SuppressionRule).optional(),
  })
  .meta({ id: "drift-policy-v1", title: "DRIFT project policy (drift-policy/v1)" });
export type Policy = z.infer<typeof Policy>;

export const DEFAULT_POLICY: Policy = { format: POLICY_FORMAT };
