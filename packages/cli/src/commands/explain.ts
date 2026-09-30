import { readFile } from "node:fs/promises";
import { compare, omittedBody } from "@drift/core";
import { ExitCode, Report, type ClassifiedChange } from "@drift/report-schema";
import { absolute, displayPath } from "../fs-reader.ts";
import { describeZod, UsageError } from "../inputs.ts";
import type { CliIo } from "../program.ts";
import { prepareCompare, type CompareFlags } from "./compare.ts";

export interface ExplainFlags extends Omit<CompareFlags, "format" | "out"> {
  /** A saved `drift compare --format json` report, instead of comparing again. */
  report?: string;
  format: "text" | "json";
}

async function reportFrom(flags: ExplainFlags, cwd: string): Promise<Report> {
  if (flags.report !== undefined) {
    const path = absolute(cwd, flags.report);
    const shown = displayPath(cwd)(path);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new UsageError(`drift: cannot read ${shown} as JSON`);
    }
    const parsed = Report.safeParse(value);
    if (!parsed.success) throw new UsageError(describeZod(parsed.error, shown));
    return parsed.data;
  }
  const { input } = await prepareCompare({ ...flags, format: "json" }, cwd);
  return compare(input);
}

export function renderExplanation(change: ClassifiedChange): string {
  const e = change.evidence;
  let text = `${change.severity}  ${change.message}\n\n`;
  const rows: [string, string][] = [
    ["change", `${change.id} (${change.kind}, ${change.direction})`],
    ["operation", change.operation],
    [
      "where",
      change.position
        ? `${change.position.file}:${String(change.position.line)}:${String(change.position.column)}`
        : `${change.side} ${change.location}`,
    ],
    ["rule", change.ruleId],
    ["why", change.rationale],
    [
      "evidence",
      `${e.status}; checked ${String(e.checked.recorded)} recorded + ${String(e.checked.synthetic)} synthetic, failed ${String(e.failed.recorded)} recorded + ${String(e.failed.synthetic)} synthetic, ${String(e.unknown)} unknown (redacted)`,
    ],
    [
      "confidence",
      change.confidence === null
        ? "none (not verifiable by samples; the label is structural)"
        : change.confidence.toFixed(4),
    ],
    ["recorded traffic", change.unverified ? "none reached this change (unverified)" : "reached this change"],
  ];
  if (change.escalation) rows.push(["escalated", change.escalation]);
  if (change.suppression)
    rows.push(["suppressed", `until ${change.suppression.expiresAt}: ${change.suppression.reason}`]);
  if (change.before !== undefined) rows.push(["before", JSON.stringify(change.before)]);
  if (change.after !== undefined) rows.push(["after", JSON.stringify(change.after)]);
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) text += `  ${label.padEnd(width)}  ${value}\n`;
  e.examples.forEach((example, index) => {
    const origin = example.line === undefined ? example.origin : `${example.origin}, line ${String(example.line)}`;
    text += `\nfailing sample ${String(index + 1)} (${origin}; redacted: ${example.redacted.length > 0 ? example.redacted.join(", ") : "nothing"})\n`;
    text += `${JSON.stringify(example.payload, null, 2)}\n`;
    const omitted = omittedBody(example);
    if (omitted) text += `${omitted}\n`;
    for (const error of example.errors) text += `  ✖ ${error.pointer}  ${error.keyword}: ${error.message}\n`;
  });
  return text;
}

/** `drift explain <change-id>`: everything DRIFT knows about one change. Accepts a unique id prefix. */
export async function explainCommand(id: string, flags: ExplainFlags, io: CliIo, cwd: string): Promise<ExitCode> {
  let report: Report;
  try {
    report = await reportFrom(flags, cwd);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr(`${error.message}\n`);
    return ExitCode.UsageError;
  }
  const matches = report.changes.filter((change) => change.id === id || (id.length >= 4 && change.id.startsWith(id)));
  if (matches.length !== 1) {
    io.stderr(
      matches.length === 0
        ? `drift: no change with id "${id}" (drift compare lists the ids in brackets)\n`
        : `drift: "${id}" matches ${String(matches.length)} changes; give more of the id\n`
    );
    return ExitCode.UsageError;
  }
  const [change] = matches as [ClassifiedChange];
  io.stdout(flags.format === "json" ? `${JSON.stringify(change, null, 2)}\n` : renderExplanation(change));
  return ExitCode.Pass;
}
