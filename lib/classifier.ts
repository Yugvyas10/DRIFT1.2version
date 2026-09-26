import { ReportSeverity } from "@prisma/client";

export type Severity = "SAFE" | "RISKY" | "BREAKING";

export const TO_DB: Record<Severity, ReportSeverity> = {
  SAFE: "PASSED",
  RISKY: "WARNING",
  BREAKING: "CRITICAL_BREAKING",
} as const;

export const FROM_DB: Record<ReportSeverity, Severity> = {
  PASSED: "SAFE",
  WARNING: "RISKY",
  CRITICAL_BREAKING: "BREAKING",
} as const;

const CANDIDATE_BREAKING = new Set([
  "ENDPOINT_REMOVED",
  "REQUIRED_PARAM_ADDED",
  "FIELD_TYPE_CHANGED",
  "ENUM_VALUE_REMOVED",
  "RESPONSE_STATUS_REMOVED",
  "REQUEST_BODY_REQUIRED_ADDED",
]);

export interface ReplayStats {
  total: number;
  failed: number;
}

/**
 * Classifies contract changes into canonical severity levels:
 * - SAFE: Non-breaking schema additions or documentation tweaks
 * - RISKY: Potential structural breaking change, but shadow replay traffic showed 0 failures
 * - BREAKING: High-risk breaking change with verified failing replay traffic
 */
export function classify(kind: string, replay: ReplayStats): Severity {
  if (!CANDIDATE_BREAKING.has(kind.toUpperCase())) {
    return "SAFE";
  }

  if (replay.failed > 0) {
    return "BREAKING";
  }

  return "RISKY";
}

/**
 * Aggregates multiple classified items into an overall report severity.
 */
export function summarizeSeverity(severities: Severity[]): Severity {
  if (severities.includes("BREAKING")) return "BREAKING";
  if (severities.includes("RISKY")) return "RISKY";
  return "SAFE";
}
