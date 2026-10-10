import type {
  Change,
  ChangeEvidence,
  ClassifiedChange,
  EvidenceStatus,
  FailOn,
  ReportDiagnostic,
  Severity,
} from "@drift/report-schema";
import {
  findRule,
  type ConfidenceParameters,
  type Policy,
  type Rule,
  type Ruleset,
  type SuppressionRule,
} from "@drift/rules";
import type { Evidence } from "../verify/verify.ts";

export interface ClassifyInput {
  changes: readonly Change[];
  evidence: Readonly<Record<string, Evidence>>;
  ruleset: Ruleset;
  policy: Policy;
  /** The date suppressions are checked against (YYYY-MM-DD). Passed in, so results are reproducible. */
  asOf: string;
  /** Overrides the policy's `failOn` (e.g. from the command line). */
  failOn?: FailOn;
}

export interface ClassifyResult {
  changes: ClassifiedChange[];
  summary: { breaking: number; risky: number; safe: number; suppressed: number };
  semver: "major" | "minor" | "patch";
  gate: { failOn: FailOn; passed: boolean };
  diagnostics: ReportDiagnostic[];
}

/**
 * Confidence of a label from its evidence (ADR-0002, formula fixed in M2). With n = recorded samples that reached
 * the change:
 *
 * - recorded failing evidence → 1;
 * - synthetic-only failing evidence → syntheticFailing · 2^(−n / syntheticHalfLife): below 1, and falling as
 *   real traffic reaches the change without failing;
 * - no failing evidence → max(0, 1 − ruleOfThree / n): with 0 failures in n samples, the 95% upper bound on the
 *   failing share is 3/n (the rule of three); 0 when n = 0;
 * - a change no sample can prove or disprove → null (the label is structural only).
 */
export function assess(
  rule: Rule,
  evidence: Evidence,
  parameters: ConfidenceParameters
): { status: EvidenceStatus; confidence: number | null; unverified: boolean } {
  const n = evidence.checked.recorded;
  const unverified = n === 0;
  if (evidence.failed.recorded > 0) return { status: "failing", confidence: 1, unverified };
  if (evidence.failed.synthetic > 0) {
    const confidence = parameters.syntheticFailing * 2 ** (-n / parameters.syntheticHalfLife);
    return { status: "failing", confidence: round(confidence), unverified };
  }
  if (!rule.verifiable) return { status: "not_verifiable", confidence: null, unverified };
  const checked = evidence.checked.recorded + evidence.checked.synthetic;
  const confidence = n === 0 ? 0 : Math.max(0, 1 - parameters.ruleOfThree / n);
  return { status: checked === 0 ? "no_samples" : "passing", confidence: round(confidence), unverified };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** `*` matches any text; everything else matches itself. */
export function globMatch(pattern: string, text: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "s").test(text);
}

function suppresses(suppression: SuppressionRule, change: Change, rule: Rule): boolean {
  if (suppression.changeId !== undefined) return suppression.changeId === change.id;
  return (
    suppression.ruleId === rule.id &&
    (suppression.operation === undefined || globMatch(suppression.operation, change.operation)) &&
    (suppression.location === undefined || globMatch(suppression.location, change.location))
  );
}

const EMPTY: Evidence = {
  checked: { recorded: 0, synthetic: 0 },
  failed: { recorded: 0, synthetic: 0 },
  unknown: 0,
  examples: [],
};

/**
 * Stage 5 — Classify (PLAN §4.5). The label follows the fixed core policy (ADR-0002): failing evidence →
 * BREAKING; otherwise a structurally dangerous change is RISKY and a safe one SAFE. Missing evidence never
 * produces SAFE. The rules only say what each kind of change means structurally.
 *
 * A policy may escalate SAFE to RISKY, and may suppress changes with a reason and an expiry date: suppressed
 * changes stay in the report but do not count towards the gate. Expired suppressions are ignored and reported.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const { ruleset, policy } = input;
  const failOn = input.failOn ?? policy.failOn ?? "breaking";
  const diagnostics: ReportDiagnostic[] = [];
  const suppressions = (policy.suppressions ?? []).filter((suppression) => {
    if (suppression.expiresAt >= input.asOf) return true;
    diagnostics.push({
      level: "warning",
      code: "SUPPRESSION_EXPIRED",
      message: `A suppression (${suppression.changeId ?? suppression.ruleId ?? ""}) expired on ${suppression.expiresAt} and was ignored: ${suppression.reason}`,
    });
    return false;
  });
  const used = new Set<SuppressionRule>();

  const changes = input.changes.map((change): ClassifiedChange => {
    const rule = findRule(ruleset, change.kind, change.direction);
    const evidence = input.evidence[change.id] ?? EMPTY;
    const assessment = assess(rule, evidence, ruleset.confidence);
    let severity: Severity =
      assessment.status === "failing" ? "BREAKING" : rule.structural === "dangerous" ? "RISKY" : "SAFE";
    let escalation: string | undefined;
    if (severity === "SAFE") {
      const match = (policy.escalate ?? []).find(
        (entry) =>
          (entry.ruleId === undefined || entry.ruleId === rule.id) &&
          (entry.kind === undefined || entry.kind === change.kind) &&
          (entry.direction === undefined || entry.direction === change.direction)
      );
      if (match) {
        severity = "RISKY";
        escalation = match.reason;
      }
    }
    const suppression = suppressions.find((candidate) => suppresses(candidate, change, rule));
    if (suppression) used.add(suppression);
    const report: ChangeEvidence = {
      status: assessment.status,
      checked: { ...evidence.checked },
      failed: { ...evidence.failed },
      unknown: evidence.unknown,
      examples: evidence.examples,
    };
    return {
      ...change,
      severity,
      ruleId: rule.id,
      rationale: rule.rationale,
      confidence: assessment.confidence,
      unverified: assessment.unverified,
      evidence: report,
      ...(escalation === undefined ? {} : { escalation }),
      ...(suppression ? { suppression: { reason: suppression.reason, expiresAt: suppression.expiresAt } } : {}),
    };
  });

  for (const suppression of suppressions) {
    if (!used.has(suppression)) {
      diagnostics.push({
        level: "info",
        code: "SUPPRESSION_UNUSED",
        message: `A suppression (${suppression.changeId ?? suppression.ruleId ?? ""}) matched no change`,
      });
    }
  }

  const active = changes.filter((change) => !change.suppression);
  const count = (severity: Severity) => active.filter((change) => change.severity === severity).length;
  const summary = {
    breaking: count("BREAKING"),
    risky: count("RISKY"),
    safe: count("SAFE"),
    suppressed: changes.length - active.length,
  };
  const riskyIsMajor = policy.riskyIsMajor ?? true;
  // The semver recommendation describes the change itself, so suppressed changes count too.
  const semver = changes.some(
    (change) => change.severity === "BREAKING" || (riskyIsMajor && change.severity === "RISKY")
  )
    ? "major"
    : changes.some((change) => findRule(ruleset, change.kind, change.direction).additive)
      ? "minor"
      : "patch";
  const passed = failOn === "breaking" ? summary.breaking === 0 : summary.breaking + summary.risky === 0;
  return { changes, summary, semver, gate: { failOn, passed }, diagnostics };
}
