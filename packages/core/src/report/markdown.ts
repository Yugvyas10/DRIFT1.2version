import type { ClassifiedChange, Report } from "@drift/report-schema";
import { bySeverity, evidenceSummary, gateLine, omittedBody, where } from "./common.ts";

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
    const omitted = omittedBody(example);
    text += `${codeBlock(JSON.stringify(example.payload, null, 2), "json")}\n\n${omitted ? `${codeBlock(omitted)}\n\n` : ""}`;
    text += `${codeBlock(errors)}\n\n  </details>\n`;
  }
  return `${text}\n`;
}

const TABLE_HEAD = "| Operation | Direction | Change | Evidence |\n| --- | --- | --- | --- |\n";

function row(change: ClassifiedChange): string {
  return `| ${inline(change.operation)} | ${change.direction} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(evidenceSummary(change))} |\n`;
}

export interface MarkdownOptions {
  /**
   * Longest result, in UTF-16 code units (a GitHub comment holds 65,536). A report that does not fit keeps its
   * header and footer, lists changes in order (BREAKING in full, then RISKY and SAFE rows) while they fit, and
   * says how many of each it left out. At least the header, the note and the footer are always returned.
   */
  maxLength?: number;
  /** Where the full report can be found, for the note on a shortened report. */
  fullReport?: string;
}

/** The Markdown report: a PR comment or job summary. BREAKING changes in full, the rest in collapsed tables. */
export function renderMarkdown(report: Report, options: MarkdownOptions = {}): string {
  const s = report.summary;
  const icon = report.gate.passed ? "✅" : "❌";
  let head = `${MARKDOWN_MARKER}\n## ${icon} DRIFT: contract gate ${report.gate.passed ? "passed" : "failed"}\n\n`;
  head += `${escapeMarkdown(gateLine(report))}\n\n`;
  head += `| BREAKING | RISKY | SAFE | Suppressed | Semver |\n| --- | --- | --- | --- | --- |\n`;
  head += `| ${String(s.breaking)} | ${String(s.risky)} | ${String(s.safe)} | ${String(s.suppressed)} | ${report.semver} |\n\n`;
  head += `Comparing ${inline(report.base.file)} (${escapeMarkdown(report.base.version)}) with ${inline(report.head.file)} (${escapeMarkdown(report.head.version)}).`;
  const corpus = report.corpus;
  head +=
    corpus.source.kind === "none"
      ? " No traffic was given: evidence comes from **synthetic** samples only.\n"
      : ` Traffic: ${String(corpus.recorded.read)} records read, ${String(corpus.recorded.sampled)} kept; ${String(corpus.synthetic.generated)} synthetic samples.\n`;

  let tail = "";
  if (report.unattributed.length > 0) {
    tail += "\n> [!WARNING]\n> Some samples fail under the new contract for a reason no detected change explains:";
    for (const item of report.unattributed)
      tail += ` ${inline(item.operation)} (${item.direction}, ${String(item.count)})`;
    tail += "\n";
  }
  tail += `\n<sub>DRIFT ${escapeMarkdown(report.engine.version)} · rules ${escapeMarkdown(report.rules.version)} · synthetic evidence is marked as such and never counts as recorded.</sub>\n`;

  const breaking = bySeverity(report, "BREAKING");
  const tables = (["RISKY", "SAFE"] as const).map((severity) => ({ severity, changes: bySeverity(report, severity) }));
  const body = (shown: { breaking: number; RISKY: number; SAFE: number }) => {
    let text = "";
    if (breaking.length > 0) {
      text += `\n### BREAKING (${String(breaking.length)})\n\n${breaking.slice(0, shown.breaking).map(details).join("")}`;
    }
    for (const { severity, changes } of tables) {
      if (changes.length === 0) continue;
      const open = severity === "RISKY" && report.gate.failOn === "risky" ? " open" : "";
      const rows = shown[severity] > 0 ? `${TABLE_HEAD}${changes.slice(0, shown[severity]).map(row).join("")}` : "";
      text += `\n<details${open}><summary><strong>${severity} (${String(changes.length)})</strong></summary>\n\n${rows}\n</details>\n`;
    }
    return text;
  };
  const all = {
    breaking: breaking.length,
    RISKY: tables[0]?.changes.length ?? 0,
    SAFE: tables[1]?.changes.length ?? 0,
  };
  const full = head + body(all) + tail;
  const max = options.maxLength;
  if (max === undefined || full.length <= max) return full;

  // Shortened: add changes in order while the result, with its note, still fits.
  const note = (shown: typeof all) => {
    const left = [
      [all.breaking - shown.breaking, "BREAKING"],
      [all.RISKY - shown.RISKY, "RISKY"],
      [all.SAFE - shown.SAFE, "SAFE"],
    ].filter(([count]) => (count as number) > 0);
    const where = options.fullReport === undefined ? "" : ` ${escapeMarkdown(options.fullReport)}`;
    return `\n> [!NOTE]\n> Shortened to fit: ${left.map(([count, label]) => `${String(count)} ${String(label)}`).join(", ")} ${left.length === 1 && left[0]?.[0] === 1 ? "change is" : "changes are"} not listed here.${where}\n`;
  };
  const shown = { breaking: 0, RISKY: 0, SAFE: 0 };
  const fits = (candidate: typeof all) => (head + body(candidate) + note(candidate) + tail).length <= max;
  for (const key of ["breaking", "RISKY", "SAFE"] as const) {
    // The largest count that fits (binary search: the length grows with the count), so a big report renders
    // O(log n) times rather than once per change.
    let low = 0;
    let high = all[key];
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits({ ...shown, [key]: mid })) low = mid;
      else high = mid - 1;
    }
    shown[key] = low;
    if (low < all[key]) break; // keep the order: nothing after a severity that did not fit completely
  }
  return head + body(shown) + note(shown) + tail;
}
