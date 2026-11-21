import type { Change, ClassifiedChange, Diagnostic, Report } from "@drift/report-schema";

/** `file:line:col  error  CODE  message`, one per line. */
export function renderDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const position = d.line === undefined ? d.file : `${d.file}:${d.line}:${d.column ?? 1}`;
      return `${position}  ${d.severity}  ${d.code}  ${d.message}\n`;
    })
    .join("");
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Human-readable diff: changes grouped by operation, most important first within each. */
export function renderChanges(changes: readonly Change[]): string {
  if (changes.length === 0) return "No changes.\n";
  const risky = changes.filter((change) => change.candidateSeverity === "RISKY").length;
  const operations = new Map<string, Change[]>();
  for (const change of changes) {
    const list = operations.get(change.operation) ?? [];
    list.push(change);
    operations.set(change.operation, list);
  }
  let text = `${countLabel(changes.length, "change")} (${risky} RISKY, ${changes.length - risky} SAFE) in ${countLabel(operations.size, "operation")}\n`;
  for (const [operation, list] of operations) {
    text += `\n${operation}\n`;
    const ordered = [...list].sort((a, b) =>
      a.candidateSeverity === b.candidateSeverity ? 0 : a.candidateSeverity === "RISKY" ? -1 : 1
    );
    for (const change of ordered) {
      text += `  ${change.candidateSeverity.padEnd(5)}  ${change.direction.padEnd(8)}  ${change.kind}  [${change.id}]\n`;
      text += `         ${change.message}\n`;
      text += `         at ${change.side} ${change.location}\n`;
    }
  }
  return text;
}

const SEVERITY_ORDER = ["BREAKING", "RISKY", "SAFE"] as const;

function evidenceLine(change: ClassifiedChange): string {
  const { evidence } = change;
  const checked = evidence.checked.recorded + evidence.checked.synthetic;
  const failed = evidence.failed.recorded + evidence.failed.synthetic;
  const confidence = change.confidence === null ? "structural only" : `confidence ${change.confidence.toFixed(2)}`;
  let text: string;
  switch (evidence.status) {
    case "failing": {
      const origin = evidence.failed.recorded > 0 ? "recorded" : "synthetic";
      text = `${failed} of ${countLabel(checked, "sample")} ${failed === 1 ? "fails" : "fail"} (${origin})`;
      break;
    }
    case "passing":
      text = `${countLabel(checked, "sample")} reached it, none fail (${evidence.checked.recorded} recorded)`;
      break;
    case "no_samples":
      text = "no sample reached it";
      break;
    case "not_verifiable":
      text = "not verifiable by samples";
      break;
  }
  return `${text}; ${confidence}${change.unverified ? "; unverified (no recorded traffic)" : ""}`;
}

/**
 * The plain-text report of `drift compare` (the full console, HTML, Markdown and SARIF formats arrive in M3).
 * Changes are grouped by label; each shows its rule, evidence and first failing sample.
 */
export function renderReport(report: Report): string {
  const { corpus } = report;
  let text = "";
  for (const [label, spec] of [
    ["base", report.base],
    ["head", report.head],
  ] as const) {
    text += `${label}  ${spec.file}  (OpenAPI ${spec.oasVersion}, ${countLabel(spec.operations, "operation")})\n`;
  }
  if (corpus.source.kind === "none") text += "traffic  none (synthetic samples only)\n";
  else {
    const r = corpus.recorded;
    text += `traffic  ${corpus.source.file ?? corpus.source.kind}: ${r.read} read, ${r.malformed} malformed, ${r.unrouted} unrouted, ${r.outOfScope} out of scope, ${r.sampled} kept\n`;
  }
  text += `synthetic  ${corpus.synthetic.generated} samples generated (marked synthetic)\n`;
  for (const severity of SEVERITY_ORDER) {
    const changes = report.changes.filter((change) => change.severity === severity);
    if (changes.length === 0) continue;
    text += `\n${severity} (${changes.length})\n`;
    for (const change of changes) {
      const suppressed = change.suppression ? `  [suppressed until ${change.suppression.expiresAt}]` : "";
      text += `  ${change.operation}  ${change.direction}  ${change.kind}  [${change.id}]${suppressed}\n`;
      text += `      ${change.message}\n`;
      text += `      rule ${change.ruleId}: ${change.rationale}\n`;
      text += `      evidence: ${evidenceLine(change)}\n`;
      const [example] = change.evidence.examples;
      if (example) {
        const where = example.line === undefined ? example.origin : `${example.origin}, line ${example.line}`;
        const errors = example.errors.map((error) => `${error.pointer} ${error.message}`).join("; ");
        text += `      sample (${where}): ${JSON.stringify(example.payload)}\n`;
        text += `      fails: ${errors}\n`;
      }
    }
  }
  for (const item of report.unattributed) {
    text += `\nunattributed  ${item.operation} ${item.direction}: ${countLabel(item.count, "sample")} fail for a reason no change explains\n`;
  }
  for (const diagnostic of report.diagnostics)
    text += `\n${diagnostic.level}  ${diagnostic.code}  ${diagnostic.message}`;
  if (report.diagnostics.length > 0) text += "\n";
  const s = report.summary;
  text += `\n${s.breaking} BREAKING, ${s.risky} RISKY, ${s.safe} SAFE${s.suppressed > 0 ? `, ${s.suppressed} suppressed` : ""}; semver: ${report.semver}\n`;
  text += report.gate.passed
    ? `✔ gate passed (fail on ${report.gate.failOn})\n`
    : `✖ gate failed (fail on ${report.gate.failOn})\n`;
  return text;
}
