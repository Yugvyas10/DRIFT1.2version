import type { Report, Severity } from "@drift/report-schema";
import { bySeverity, evidenceSummary, gateLine, omittedBody, plural, SEVERITIES, where } from "./common.ts";

export interface ConsoleOptions {
  /** ANSI colours. The CLI turns them off for NO_COLOR, non-terminals and files. */
  color: boolean;
}

const CODES = { red: 31, yellow: 33, green: 32, dim: 2, bold: 1 } as const;

/**
 * The console report: changes grouped by label, each with its rule, evidence, position and first failing sample.
 */
export function renderConsole(report: Report, options: ConsoleOptions = { color: false }): string {
  const paint = (code: keyof typeof CODES, text: string) =>
    options.color ? `\u001b[${String(CODES[code])}m${text}\u001b[0m` : text;
  const tone: Record<Severity, keyof typeof CODES> = { BREAKING: "red", RISKY: "yellow", SAFE: "green" };
  const { corpus } = report;
  let text = "";
  for (const [label, spec] of [
    ["base", report.base],
    ["head", report.head],
  ] as const) {
    text += `${label}  ${spec.file}  (OpenAPI ${spec.oasVersion}, ${plural(spec.operations, "operation")})\n`;
  }
  if (corpus.source.kind === "none") text += "traffic  none (synthetic samples only)\n";
  else {
    const r = corpus.recorded;
    text += `traffic  ${corpus.source.file ?? corpus.source.kind}: ${String(r.read)} read, ${String(r.malformed)} malformed, ${String(r.unrouted)} unrouted, ${String(r.outOfScope)} out of scope, ${String(r.sampled)} kept\n`;
  }
  text += `synthetic  ${String(corpus.synthetic.generated)} samples generated (marked synthetic)\n`;
  for (const severity of SEVERITIES) {
    const changes = bySeverity(report, severity);
    if (changes.length === 0) continue;
    text += `\n${paint(tone[severity], paint("bold", `${severity} (${String(changes.length)})`))}\n`;
    for (const change of changes) {
      const suppressed = change.suppression ? `  [suppressed until ${change.suppression.expiresAt}]` : "";
      text += `  ${paint(tone[severity], change.operation)}  ${change.direction}  ${change.kind}  [${change.id}]${suppressed}\n`;
      text += `      ${change.message}\n`;
      text += paint("dim", `      at ${where(change)}\n`);
      text += paint("dim", `      rule ${change.ruleId}: ${change.rationale}\n`);
      text += `      evidence: ${evidenceSummary(change)}\n`;
      if (change.escalation) text += `      escalated by policy: ${change.escalation}\n`;
      const [example] = change.evidence.examples;
      if (example) {
        const origin = example.line === undefined ? example.origin : `${example.origin}, line ${String(example.line)}`;
        text += `      sample (${origin}): ${JSON.stringify(example.payload)}\n`;
        const omitted = omittedBody(example);
        if (omitted) text += `      ${omitted}\n`;
        text += `      fails: ${example.errors.map((error) => `${error.pointer} ${error.message}`).join("; ")}\n`;
      }
    }
  }
  for (const item of report.unattributed) {
    text += `\n${paint("yellow", "unattributed")}  ${item.operation} ${item.direction}: ${plural(item.count, "sample")} fail for a reason no change explains\n`;
  }
  if (report.diagnostics.length > 0) {
    text += "\n";
    for (const diagnostic of report.diagnostics)
      text += `${diagnostic.level}  ${diagnostic.code}  ${diagnostic.message}\n`;
  }
  const mark = report.gate.passed ? paint("green", "✔ gate") : paint("red", "✖ gate");
  return `${text}\n${mark} ${gateLine(report)}\n`;
}
