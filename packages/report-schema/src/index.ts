import { z } from "zod";

/**
 * The report format identifier written into every `drift-report/v1` document.
 * The full report schema is finalised in M2 (PLAN §6); this module holds the vocabulary
 * that every other package already shares.
 */
export const REPORT_SCHEMA_ID = "drift-report/v1";

/**
 * The three labels DRIFT assigns to a change (ADR-0002):
 * - BREAKING: failing evidence exists (a sample valid under the old contract fails under the new one).
 * - RISKY: structurally dangerous, but no failing evidence was found.
 * - SAFE: structurally safe under the direction rules.
 */
export const Severity = z.enum(["BREAKING", "RISKY", "SAFE"]);
export type Severity = z.infer<typeof Severity>;

/**
 * Which side of the contract a change affects (PLAN §4.2).
 * Narrowing what the server accepts (request) or widening what it returns (response) is dangerous.
 */
export const Direction = z.enum(["request", "response"]);
export type Direction = z.infer<typeof Direction>;

/** The gate threshold: fail on BREAKING only (default) or on RISKY and above (PLAN §4.6). */
export const FailOn = z.enum(["breaking", "risky"]);
export type FailOn = z.infer<typeof FailOn>;

/** Process exit codes of the CLI and the GitHub Action (PLAN §4.6). */
export const ExitCode = {
  /** The gate passed. */
  Pass: 0,
  /** The gate failed: a change at or above `--fail-on` was found. */
  GateFailed: 1,
  /** Usage error, invalid configuration or invalid spec. */
  UsageError: 2,
  /** Internal error: a bug or an infrastructure failure. */
  InternalError: 3,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
