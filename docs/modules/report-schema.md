# @drift/report-schema — the report contract

**Owner:** P4 (Pruthvi Gangapure). Reviewers P1, P3. **Status:** M2 — `drift-report/v1` and `drift-traffic/v1` are defined, with generated JSON Schemas committed under `schemas/`.

## Purpose

The single contract shared by the engine, CLI, Action, worker and web. When the web app renders a run, this schema is all it knows about the engine.

## Public API

| Export                                                                                                   | Meaning                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `REPORT_SCHEMA_ID`, `Severity`, `Direction`, `FailOn`, `ExitCode`                                        | Vocabulary (ADR-0002, PLAN §4.2, §4.6).                                                   |
| `CHANGE_KINDS`, `ChangeKind`, `Change`, `CandidateSeverity`                                              | The 46 change kinds and the structural change record.                                     |
| `Diagnostic`, `DIAGNOSTIC_CODES`                                                                         | Located problems in a spec.                                                               |
| `DiffOutput`, `SpecSummary`                                                                              | `drift-diff/v1`, printed by `drift diff --format json`.                                   |
| `Report`                                                                                                 | `drift-report/v1`, printed by `drift compare --format json`.                              |
| `ClassifiedChange`, `ChangeEvidence`, `EvidenceExample`, `EvidenceStatus`, `SampleOrigin`, `SampleError` | A labelled change and its evidence.                                                       |
| `CorpusSummary`, `UnattributedFailure`, `ReportDiagnostic`, `StageName`, `Suppression`                   | The other report sections.                                                                |
| `TrafficRecord`, `TRAFFIC_FORMAT`, `WireValue`                                                           | One line of a `drift-traffic/v1` file (see [../traffic-format.md](../traffic-format.md)). |
| `jsonSchemas()`                                                                                          | The published JSON Schemas.                                                               |

## `drift-report/v1` in one screen

- `engine`, `rules` (version and hash), `policy` (hash and `failOn`), `base` and `head` summaries.
- `corpus`: the traffic source; records read, malformed (with the first reasons, never the content), unrouted, out of scope and kept; the caps; synthetic samples generated and discarded; redaction counts; coverage of affected operations.
- `changes`: each change with `severity`, `ruleId`, `rationale`, `confidence` (null when not verifiable), `unverified`, and `evidence`:
  - `status`: `failing`, `passing`, `no_samples` or `not_verifiable`;
  - `checked` and `failed`, each split into recorded and synthetic;
  - `unknown`: samples whose only failures were at redacted values;
  - `examples`: redacted failing samples with their errors and the redacted pointers.
- `unattributed`: failures no change explains. `nonConformance`: recorded traffic that was already invalid.
- `summary`, `semver`, `gate`, `stages` (the content-addressed key of every stage output) and `diagnostics`.

## Key design decisions

- **zod is the source of truth.** The JSON Schemas are generated with `z.toJSONSchema` and committed. A test fails if they differ, so the published schema can never drift from the code.
- **The traffic format is strict:** an unknown field is an error, so a misspelt `reqestBody` is reported instead of silently ignored.
- **`candidateSeverity` can never be BREAKING**, and `confidence` is null rather than a made-up number when samples cannot decide.
- **A leaf package:** lint forbids it from importing any other `@drift/*` package.

## Questions an examiner might ask

- **Why version the format in the id (`/v1`)?** Stored reports outlive engine releases. A consumer can refuse or migrate an unknown version instead of misreading it.
- **Why do malformed-line reasons never quote the line?** A malformed line may contain a secret that redaction never saw, because redaction runs on parsed records. Reasons name only the field path and the kind of problem.
- **Why keep both `checked` and `failed` per origin?** So a reader can see whether a label rests on real traffic or on generated samples, which is what confidence is computed from.
