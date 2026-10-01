import type { ClassifiedChange, EvidenceExample, Report, Severity } from "@drift/report-schema";

export const SEVERITIES: readonly Severity[] = ["BREAKING", "RISKY", "SAFE"];

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** A note for an example whose body was too large to include, e.g. "body omitted (135.2 KiB, …)"; else undefined. */
export function omittedBody(example: EvidenceExample): string | undefined {
  const omitted = example.bodyOmitted;
  if (!omitted) return undefined;
  const values =
    Object.keys(omitted.values).length > 0 ? `; values at the failing pointers: ${JSON.stringify(omitted.values)}` : "";
  return `body omitted (${(omitted.bytes / 1024).toFixed(1)} KiB, too large for the report)${values}`;
}

/** Whether a change makes the gate fail under the report's `failOn`. */
export function failsGate(change: ClassifiedChange, report: Report): boolean {
  if (change.suppression) return false;
  return change.severity === "BREAKING" || (report.gate.failOn === "risky" && change.severity === "RISKY");
}

/** One sentence about a change's evidence, e.g. "1 of 3 samples fails (recorded); confidence 1.00". */
export function evidenceSummary(change: ClassifiedChange): string {
  const { evidence } = change;
  const checked = evidence.checked.recorded + evidence.checked.synthetic;
  const failed = evidence.failed.recorded + evidence.failed.synthetic;
  let text: string;
  switch (evidence.status) {
    case "failing":
      text = `${String(failed)} of ${plural(checked, "sample")} ${failed === 1 ? "fails" : "fail"} (${evidence.failed.recorded > 0 ? "recorded" : "synthetic"})`;
      break;
    case "passing":
      text = `${plural(checked, "sample")} reached it, none fail (${String(evidence.checked.recorded)} recorded)`;
      break;
    case "no_samples":
      text = "no sample reached it";
      break;
    case "not_verifiable":
      text = "not verifiable by samples";
      break;
  }
  const confidence = change.confidence === null ? "structural only" : `confidence ${change.confidence.toFixed(2)}`;
  return `${text}; ${confidence}${change.unverified ? "; unverified (no recorded request reached it)" : ""}`;
}

/** `file:line:col`, or the location itself when its position is unknown. */
export function where(change: ClassifiedChange): string {
  const p = change.position;
  return p ? `${p.file}:${String(p.line)}:${String(p.column)}` : `${change.side} ${change.location}`;
}

export function bySeverity(report: Report, severity: Severity): ClassifiedChange[] {
  return report.changes.filter((change) => change.severity === severity);
}

export function gateLine(report: Report): string {
  const s = report.summary;
  const counts = `${String(s.breaking)} BREAKING, ${String(s.risky)} RISKY, ${String(s.safe)} SAFE${s.suppressed > 0 ? `, ${String(s.suppressed)} suppressed` : ""}`;
  return `${report.gate.passed ? "passed" : "failed"} (fail on ${report.gate.failOn}): ${counts}; semver ${report.semver}`;
}
