import type { Change, Diagnostic } from "@drift/report-schema";

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
