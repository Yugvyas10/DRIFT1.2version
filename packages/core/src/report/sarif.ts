import type { ClassifiedChange, Report } from "@drift/report-schema";
import { evidenceSummary } from "./common.ts";

type Json = Record<string, unknown>;

const LEVEL = { BREAKING: "error", RISKY: "warning", SAFE: "note" } as const;

function location(change: ClassifiedChange): Json[] {
  const position = change.position;
  if (!position) return [];
  return [
    {
      physicalLocation: {
        // Relative paths with forward slashes, resolved against the checkout (code scanning's convention).
        artifactLocation: { uri: position.file.replace(/\\/g, "/"), uriBaseId: "%SRCROOT%" },
        region: { startLine: position.line, startColumn: position.column },
      },
      logicalLocations: [{ name: change.operation, kind: "function" }],
    },
  ];
}

/**
 * SARIF 2.1.0 (PLAN §4.6), so findings appear in GitHub code scanning at the line of the spec that changed.
 * BREAKING → error, RISKY → warning. SAFE changes are left out: code scanning is for problems. Suppressed
 * changes carry a SARIF suppression with the policy's reason. The change id is a partial fingerprint, so a
 * finding keeps its identity across runs.
 */
export function renderSarif(report: Report): string {
  const changes = report.changes.filter((change) => change.severity !== "SAFE");
  const ruleIds = [...new Set(changes.map((change) => change.ruleId))].sort();
  const rules = ruleIds.map((id) => {
    const change = changes.find((candidate) => candidate.ruleId === id);
    return {
      id,
      name: id,
      shortDescription: { text: change?.kind ?? id },
      fullDescription: { text: change?.rationale ?? id },
      properties: { kind: change?.kind, direction: change?.direction },
    };
  });
  const results = changes.map((change) => {
    const result: Json = {
      ruleId: change.ruleId,
      ruleIndex: ruleIds.indexOf(change.ruleId),
      level: LEVEL[change.severity],
      message: {
        text: `${change.severity}: ${change.message} (${change.operation}). Evidence: ${evidenceSummary(change)}.`,
      },
      locations: location(change),
      partialFingerprints: { "driftChangeId/v1": change.id },
      properties: {
        severity: change.severity,
        confidence: change.confidence,
        unverified: change.unverified,
        evidence: change.evidence.status,
        synthetic: change.evidence.failed.recorded === 0 && change.evidence.failed.synthetic > 0,
      },
    };
    if (change.suppression) {
      result.suppressions = [
        { kind: "external", justification: `${change.suppression.reason} (until ${change.suppression.expiresAt})` },
      ];
    }
    return result;
  });
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "DRIFT",
            semanticVersion: report.engine.version,
            informationUri: "https://github.com/Yugvyas10/DRIFT1.2version",
            rules,
          },
        },
        results,
        properties: { gate: report.gate, semver: report.semver, rules: report.rules },
      },
    ],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}
