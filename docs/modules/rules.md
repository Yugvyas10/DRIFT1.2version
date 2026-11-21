# @drift/rules — classification rules as data

**Owner:** P4 (Pruthvi Gangapure). Reviewer P2. **Status:** M1 — format id, rule id grammar and the structural direction table. The full ruleset (evidence conditions, rationale, policy) and its loader land in M2 (ADR-0005).

## Public API (M0)

| Export         | Meaning                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `RULES_FORMAT` | `"drift-rules/v1"`.                                                                                 |
| `RuleId`       | zod schema for ids such as `DRIFT-REQ-ENUM-REMOVED`: `DRIFT` plus uppercase segments joined by `-`. |

| `STRUCTURAL_DEFAULTS` | For every change kind: `{ request, response }`, each "dangerous" or "safe". |
| `candidateSeverity(kind, direction)` | RISKY for dangerous, SAFE for safe. Used by the diff for every change. |

A test checks that the table covers every kind in `CHANGE_KINDS`, and that each narrowing/widening pair is a mirror image across directions.

## Planned (M2)

A YAML ruleset (compiled to JSON) with its own JSON Schema. Each rule: `id`, `kind`, `direction`, a declarative `when` condition over change attributes and evidence counts, `severity`, `rationale`, `additive`. The ruleset has a semver version and a content hash; both go into every report and every Classify cache key. Projects can extend or override it with a policy file. Suppressions need a reason and an expiry.

## Questions an examiner might ask

- **Why fix the rule id grammar before any rule exists?** Reports, suppressions and `drift explain` all refer to rules by id. A stable, validated format prevents typos that would silently fail to match.
- **Why data instead of code?** Data can be schema-validated, diffed in review, versioned, and loaded safely from a project's own file without executing code (ADR-0005).
