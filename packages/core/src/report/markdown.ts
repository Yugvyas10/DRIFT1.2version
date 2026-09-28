import type { ClassifiedChange, Report } from "@drift/report-schema";
import { bySeverity, evidenceSummary, gateLine, where } from "./common.ts";

/** Hidden marker the GitHub Action uses to find and update its one PR comment (M4). */
export const MARKDOWN_MARKER = "<!-- drift-report -->";

/**
 * Escapes text for Markdown and GitHub's HTML subset: every character that could start formatting, a link,
 * a table cell or an HTML tag. Spec and traffic content is untrusted (it comes from the pull request).
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_{}[\]()#+\-.!|~>]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\r?\n/g, " ");
}

/** A fenced code block whose fence is longer than any run of backticks in the content. */
export function codeBlock(content: string, language = ""): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

/** Code-formatted untrusted text: a `<code>` element with Markdown-escaped content, so nothing can break out. */
const inline = (text: string) => `<code>${escapeMarkdown(text)}</code>`;

function details(change: ClassifiedChange): string {
  let text = `- **${escapeMarkdown(change.message)}**\n`;
  text += `  ${inline(change.operation)} · ${change.direction} · ${inline(change.kind)} · ${inline(change.id)} · at ${inline(where(change))}\n`;
  text += `  Rule ${inline(change.ruleId)}: ${escapeMarkdown(change.rationale)}\n`;
  text += `  Evidence: ${escapeMarkdown(evidenceSummary(change))}\n`;
  if (change.escalation) text += `  Escalated by policy: ${escapeMarkdown(change.escalation)}\n`;
  if (change.suppression) {
    text += `  Suppressed until ${escapeMarkdown(change.suppression.expiresAt)}: ${escapeMarkdown(change.suppression.reason)}\n`;
  }
  const [example] = change.evidence.examples;
  if (example) {
    const origin = example.line === undefined ? example.origin : `${example.origin}, line ${String(example.line)}`;
    const errors = example.errors.map((error) => `${error.pointer} ${error.message}`).join("\n");
    text += `\n  <details><summary>Failing sample (${escapeMarkdown(origin)}, redacted)</summary>\n\n`;
    text += `${codeBlock(JSON.stringify(example.payload, null, 2), "json")}\n\n${codeBlock(errors)}\n\n  </details>\n`;
  }
  return `${text}\n`;
}

function table(changes: readonly ClassifiedChange[]): string {
  let text = "| Operation | Direction | Change | Evidence |\n| --- | --- | --- | --- |\n";
  for (const change of changes) {
    text += `| ${inline(change.operation)} | ${change.direction} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(evidenceSummary(change))} |\n`;
  }
  return text;
}

/** The Markdown report: a PR comment or job summary. BREAKING changes in full, the rest in collapsed tables. */
export function renderMarkdown(report: Report): string {
  const s = report.summary;
  const icon = report.gate.passed ? "✅" : "❌";
  let text = `${MARKDOWN_MARKER}\n## ${icon} DRIFT: contract gate ${report.gate.passed ? "passed" : "failed"}\n\n`;
  text += `${escapeMarkdown(gateLine(report))}\n\n`;
  text += `| BREAKING | RISKY | SAFE | Suppressed | Semver |\n| --- | --- | --- | --- | --- |\n`;
  text += `| ${String(s.breaking)} | ${String(s.risky)} | ${String(s.safe)} | ${String(s.suppressed)} | ${report.semver} |\n\n`;
  text += `Comparing ${inline(report.base.file)} (${escapeMarkdown(report.base.version)}) with ${inline(report.head.file)} (${escapeMarkdown(report.head.version)}).`;
  const corpus = report.corpus;
  text +=
    corpus.source.kind === "none"
      ? " No traffic was given: evidence comes from **synthetic** samples only.\n"
      : ` Traffic: ${String(corpus.recorded.read)} records read, ${String(corpus.recorded.sampled)} kept; ${String(corpus.synthetic.generated)} synthetic samples.\n`;

  const breaking = bySeverity(report, "BREAKING");
  if (breaking.length > 0) text += `\n### BREAKING (${String(breaking.length)})\n\n${breaking.map(details).join("")}`;
  for (const severity of ["RISKY", "SAFE"] as const) {
    const changes = bySeverity(report, severity);
    if (changes.length === 0) continue;
    text += `\n<details${severity === "RISKY" && report.gate.failOn === "risky" ? " open" : ""}><summary><strong>${severity} (${String(changes.length)})</strong></summary>\n\n${table(changes)}\n</details>\n`;
  }
  if (report.unattributed.length > 0) {
    text += "\n> [!WARNING]\n> Some samples fail under the new contract for a reason no detected change explains:";
    for (const item of report.unattributed)
      text += ` ${inline(item.operation)} (${item.direction}, ${String(item.count)})`;
    text += "\n";
  }
  text += `\n<sub>DRIFT ${escapeMarkdown(report.engine.version)} · rules ${escapeMarkdown(report.rules.version)} · synthetic evidence is marked as such and never counts as recorded.</sub>\n`;
  return text;
}
