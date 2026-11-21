import type { ClassifiedChange, Report } from "@drift/report-schema";
import { evidenceSummary, failsGate, where } from "./common.ts";

/** Escapes text for XML content and attributes, and drops characters XML 1.0 cannot contain. */
export function escapeXml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- removing the control characters XML 1.0 forbids
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

function testcase(change: ClassifiedChange, report: Report): string {
  const name = `${change.severity} ${change.kind}${change.subject === undefined ? "" : ` ${change.subject}`} [${change.id}]`;
  const detail = `${change.message}\nat ${where(change)}\nrule ${change.ruleId}: ${change.rationale}\nevidence: ${evidenceSummary(change)}`;
  let body = "";
  if (change.suppression) body = `<skipped message="${escapeXml(`suppressed: ${change.suppression.reason}`)}"/>`;
  else if (failsGate(change, report)) {
    body = `<failure type="${change.severity}" message="${escapeXml(change.message)}">${escapeXml(detail)}</failure>`;
  }
  return `    <testcase classname="${escapeXml(change.operation)}" name="${escapeXml(name)}">${body}<system-out>${escapeXml(detail)}</system-out></testcase>\n`;
}

/**
 * JUnit XML (PLAN §4.6), for CI systems that display test results: one test suite per operation and one test
 * case per change. A change fails when it fails the gate; suppressed changes are skipped.
 */
export function renderJunit(report: Report): string {
  const operations = [...new Set(report.changes.map((change) => change.operation))].sort();
  const failures = report.changes.filter((change) => failsGate(change, report)).length;
  const skipped = report.changes.filter((change) => change.suppression).length;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="drift" tests="${String(report.changes.length)}" failures="${String(failures)}" skipped="${String(skipped)}">\n`;
  for (const operation of operations) {
    const changes = report.changes.filter((change) => change.operation === operation);
    const suiteFailures = changes.filter((change) => failsGate(change, report)).length;
    const suiteSkipped = changes.filter((change) => change.suppression).length;
    xml += `  <testsuite name="${escapeXml(operation)}" tests="${String(changes.length)}" failures="${String(suiteFailures)}" skipped="${String(suiteSkipped)}">\n`;
    for (const change of changes) xml += testcase(change, report);
    xml += "  </testsuite>\n";
  }
  return `${xml}</testsuites>\n`;
}
