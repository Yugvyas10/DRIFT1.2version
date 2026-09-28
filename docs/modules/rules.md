# @drift/rules — classification rules as data

**Owner:** P4 (Pruthvi Gangapure). Reviewer P2. **Status:** M0 — format id and rule id grammar. The default ruleset and loader land in M2 (ADR-0005).

## Public API (M0)

| Export         | Meaning                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `RULES_FORMAT` | `"drift-rules/v1"`.                                                                                 |
| `RuleId`       | zod schema for ids such as `DRIFT-REQ-ENUM-REMOVED`: `DRIFT` plus uppercase segments joined by `-`. |

## Planned (M2)

A YAML ruleset (compiled to JSON) with its own JSON Schema. Each rule: `id`, `kind`, `direction`, a declarative `when` condition over change attributes and evidence counts, `severity`, `rationale`, `additive`. The ruleset has a semver version and a content hash; both go into every report and every Classify cache key. Projects can extend or override it with a policy file. Suppressions need a reason and an expiry.

## Questions an examiner might ask

- **Why fix the rule id grammar before any rule exists?** Reports, suppressions and `drift explain` all refer to rules by id. A stable, validated format prevents typos that would silently fail to match.
- **Why data instead of code?** Data can be schema-validated, diffed in review, versioned, and loaded safely from a project's own file without executing code (ADR-0005).
