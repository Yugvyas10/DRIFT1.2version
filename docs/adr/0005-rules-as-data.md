# ADR-0005: Classification rules as versioned data

Status: Accepted (2026-09-26)
Date: 2026-09-26
Owner: P4

## Context

The legacy classifier hardcoded six change kinds in a `Set`. Rules scattered through engine code are hard to review, test, version, override per project, or cite in a report.

## Decision

- `packages/rules` ships the default ruleset as a data file (YAML source, compiled to JSON) plus a JSON Schema and a zod loader.
- Each rule has: `id` (stable, e.g. `DRIFT-REQ-ENUM-REMOVED`), `kind`, `direction`, `when` (a small declarative condition on change attributes and evidence counts; no code, no `eval`), `severity`, `rationale`, `additive`, `docsUrl`.
- The ruleset has a semver `version` and a content hash. Both appear in every report and in every Classify-stage cache key.
- Projects can extend or override rules and policy with their own file, validated by the same schema. Suppressions are policy data with a required `reason` and `expiresAt`.
- `drift rules list` and `drift explain <change-id>` render rules from this data.

## Alternatives considered

- **Rules as TypeScript functions.** Most flexible, but they cannot be validated as data, diffed meaningfully, or loaded safely from a project file.
- **A general expression language (e.g. JSONLogic, CEL).** More power than we need, and a new dependency. The condition grammar stays minimal and grows only when a rule needs it.

## Consequences

- Changing classification is a data change with its own tests and a version bump. Reports stay reproducible given `(engineVersion, rulesVersion)`.
- Coverage threshold ≥ 90% applies to `packages/rules`.

## Questions an examiner might ask

- _How do I know which rule produced a label?_ Every change in the report carries `ruleId` and `rationale`, and `drift explain` prints them.
- _Can a project silence a real break forever?_ No. Suppressions expire, need a reason, and are audited in platform mode.
