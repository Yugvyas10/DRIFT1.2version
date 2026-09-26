# @drift/report-schema — the report contract

**Owner:** P4 (Pruthvi Gangapure). Reviewers P1, P3. **Status:** M0 — vocabulary only. The full `drift-report/v1` schema lands in M2.

## Purpose

The single contract shared by the engine, CLI, Action, worker and web. When the web app renders a run, this schema is all it knows about the engine.

## Public API (M0)

| Export             | Meaning                                                      |
| ------------------ | ------------------------------------------------------------ |
| `REPORT_SCHEMA_ID` | `"drift-report/v1"`, written into every report.              |
| `Severity`         | zod enum `BREAKING`, `RISKY`, `SAFE` (ADR-0002).             |
| `Direction`        | zod enum `request`, `response` (PLAN §4.2).                  |
| `FailOn`           | zod enum `breaking`, `risky`: the gate threshold.            |
| `ExitCode`         | `Pass 0`, `GateFailed 1`, `UsageError 2`, `InternalError 3`. |

## Key design decisions

- **zod is the source of truth.** In M2 the JSON Schema is generated from zod and committed, so non-TypeScript consumers can validate reports with any JSON Schema validator.
- **Const objects instead of TypeScript `enum`s** keep the source erasable (`erasableSyntaxOnly`) and give plain values at runtime.
- **A leaf package:** lint forbids it from importing any other `@drift/*` package, so the contract cannot depend on the engine it describes.

## Questions an examiner might ask

- **Why version the format in the id (`/v1`)?** Stored reports outlive engine releases. A consumer can refuse or migrate an unknown version instead of misreading it.
- **Why are the exit codes part of the schema package?** They are part of the gate's contract with CI, and the CLI and the Action must agree on them.
