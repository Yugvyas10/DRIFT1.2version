import { z } from "zod";

/**
 * Format identifier of a rules document (ADR-0005). The default ruleset and its loader
 * arrive in M2; the identifier and the rule id grammar are fixed now because reports,
 * suppressions and `drift explain` all refer to rules by id.
 */
export const RULES_FORMAT = "drift-rules/v1";

/** A stable rule identifier such as `DRIFT-REQ-ENUM-REMOVED`: uppercase segments joined by `-`. */
export const RuleId = z.string().regex(/^DRIFT(?:-[A-Z0-9]+)+$/, "Rule ids look like DRIFT-REQ-ENUM-REMOVED");
export type RuleId = z.infer<typeof RuleId>;
