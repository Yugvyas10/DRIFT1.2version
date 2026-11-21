import type { CandidateSeverity } from "@drift/report-schema";
import { ChangeKind, Direction } from "@drift/report-schema";
import { z } from "zod";
import defaultRules from "./default-rules.json" with { type: "json" };
import { RULES_FORMAT, RuleId } from "./rule-id.ts";

/**
 * One classification rule (ADR-0005, amended in M2). The label itself follows the fixed core policy
 * (ADR-0002): failing evidence → BREAKING; otherwise `dangerous` → RISKY and `safe` → SAFE.
 * A rule therefore says only what the structure means and whether samples can prove a break.
 */
export const Rule = z.strictObject({
  id: RuleId,
  kind: ChangeKind,
  direction: Direction,
  /** The structural judgement before evidence: dangerous changes are RISKY until evidence proves them BREAKING. */
  structural: z.enum(["dangerous", "safe"]),
  /** Whether a sample can prove this kind of change breaking. If not, the label is structural only. */
  verifiable: z.boolean(),
  /** Whether the change adds functionality (used for the semver recommendation). */
  additive: z.boolean(),
  rationale: z.string().min(1),
  docsUrl: z.url().optional(),
});
export type Rule = z.infer<typeof Rule>;

/** Parameters of the confidence formula (ADR-0002). */
export const ConfidenceParameters = z.strictObject({
  /** Confidence of a label proven only by synthetic samples, before any recorded sample is seen. */
  syntheticFailing: z.number().gt(0).lt(1),
  /** Every this many recorded samples that reach the change without failing halve synthetic-only confidence. */
  syntheticHalfLife: z.number().positive(),
  /** With 0 failures in n recorded samples the 95% upper bound on the failing share is ruleOfThree / n. */
  ruleOfThree: z.number().positive(),
});
export type ConfidenceParameters = z.infer<typeof ConfidenceParameters>;

export const Ruleset = z
  .strictObject({
    $schema: z.string().optional(),
    format: z.literal(RULES_FORMAT),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "a semantic version such as 1.0.0"),
    confidence: ConfidenceParameters,
    rules: z.array(Rule).min(1),
  })
  .superRefine((ruleset, context) => {
    const ids = new Set<string>();
    const slots = new Set<string>();
    ruleset.rules.forEach((rule, index) => {
      if (ids.has(rule.id)) {
        context.addIssue({ code: "custom", path: ["rules", index, "id"], message: `Duplicate rule id ${rule.id}` });
      }
      const slot = `${rule.kind} ${rule.direction}`;
      if (slots.has(slot)) {
        context.addIssue({ code: "custom", path: ["rules", index], message: `Two rules for ${slot}` });
      }
      ids.add(rule.id);
      slots.add(slot);
    });
  })
  .meta({ id: "drift-rules-v1", title: "DRIFT classification rules (drift-rules/v1)" });
export type Ruleset = z.infer<typeof Ruleset>;

/**
 * The (kind, direction) pairs the diff stage can produce. Paths, operations, parameters, request bodies and
 * security only occur in the request direction; response statuses only in the response direction.
 */
export function occursIn(kind: ChangeKind): Direction[] {
  if (kind.startsWith("response.")) return ["response"];
  if (kind.startsWith("schema.") || kind.startsWith("media_type.") || kind === "doc.changed") {
    return ["request", "response"];
  }
  return ["request"];
}

/**
 * Validates a ruleset (the default one or a project's own file). Besides the schema, every (kind, direction)
 * pair the diff stage can produce must have a rule, so no change can go unclassified.
 */
export function parseRuleset(value: unknown): Ruleset {
  const ruleset = Ruleset.parse(value);
  const missing = ChangeKind.options.flatMap((kind) =>
    occursIn(kind)
      .filter((direction) => !ruleset.rules.some((rule) => rule.kind === kind && rule.direction === direction))
      .map((direction) => `${kind} (${direction})`)
  );
  if (missing.length > 0) {
    throw new z.ZodError([
      { code: "custom", path: ["rules"], message: `No rule for: ${missing.join(", ")}`, input: value },
    ]);
  }
  return ruleset;
}

export const DEFAULT_RULESET: Ruleset = parseRuleset(defaultRules);

export function findRule(ruleset: Ruleset, kind: ChangeKind, direction: Direction): Rule {
  const rule = ruleset.rules.find((candidate) => candidate.kind === kind && candidate.direction === direction);
  if (!rule) throw new Error(`No rule for ${kind} (${direction})`); // unreachable for a parsed ruleset
  return rule;
}

/** The structural label under the default rules: RISKY for a dangerous change, SAFE otherwise. */
export function candidateSeverity(kind: ChangeKind, direction: Direction): CandidateSeverity {
  return findRule(DEFAULT_RULESET, kind, direction).structural === "dangerous" ? "RISKY" : "SAFE";
}
