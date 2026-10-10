# @drift/rules — classification rules as data

**Owner:** P4 (Pruthvi Gangapure). Reviewer P2. **Status:** M2 — the default ruleset, its loader and JSON Schema, and the project policy format (ADR-0005, amended in M2).

## Purpose

Says what each kind of change means structurally, and whether samples can prove it breaking. The label itself follows the fixed core policy of ADR-0002, which lives in `@drift/core` (Classify): failing evidence → BREAKING; otherwise dangerous → RISKY, safe → SAFE.

## Public API

| Export                                                      | Meaning                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_RULESET`                                           | The default ruleset, loaded from `src/default-rules.json` and validated at import.                                                                  |
| `Ruleset`, `Rule`, `ConfidenceParameters`                   | zod schemas of a `drift-rules/v1` document.                                                                                                         |
| `parseRuleset(value)`                                       | Validates a ruleset (default or a project's own) and checks it has a rule for every (kind, direction) the diff can produce. Throws a `ZodError`.    |
| `findRule(ruleset, kind, direction)`                        | The rule for a change.                                                                                                                              |
| `occursIn(kind)`                                            | The directions a kind can occur in. Paths, operations, parameters, bodies and security occur in requests only; response statuses in responses only. |
| `candidateSeverity(kind, direction)`                        | RISKY/SAFE under the default rules, used by the diff for `candidateSeverity`.                                                                       |
| `Policy`, `Escalation`, `SuppressionRule`, `DEFAULT_POLICY` | zod schemas of a `drift-policy/v1` document.                                                                                                        |
| `jsonSchemas()`                                             | The published JSON Schemas, committed under `schemas/`.                                                                                             |
| `RULES_FORMAT`, `RuleId`                                    | Format id and the rule id grammar.                                                                                                                  |

## The ruleset (`src/default-rules.json`, version 1.0.0)

71 rules: one for each (kind, direction) pair the diff can produce. Each rule has:

- `id`, derived from the kind and direction: `DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED`;
- `structural`: `dangerous` or `safe`, the judgement before evidence (the table in PLAN §4.2);
- `verifiable`: whether a sample can prove it. This is false for behavioural changes (default values, discriminators, security, response statuses) and for removals that servers usually ignore (removed parameters);
- `additive`, which feeds the semver recommendation;
- `rationale`, one sentence, shown in every report.

`confidence` holds the parameters of the confidence formula (ADR-0002, M2 amendment).

A project can pass a complete ruleset of its own (`drift compare --rules file`). It is validated with the same schema and must cover every pair, so no change can go unclassified. The rules hash and version appear in every report and in the Classify cache key.

## Policy (`drift-policy/v1`)

- `failOn`: `breaking` (default) or `risky`.
- `riskyIsMajor`: whether RISKY changes make the semver recommendation `major` (default true).
- `escalate`: SAFE → RISKY by kind, direction or rule id, with a reason (e.g. treat deprecations as RISKY). There is no way to lower a label here.
- `suppressions`: by `changeId`, or by `ruleId` narrowed by `operation` and `location` globs (`*` = any text). Each needs a `reason` of at least 10 characters and an `expiresAt` date. A suppressed change stays in the report but does not count towards the gate. Expired suppressions are ignored, with a warning.

## Tests

- The ruleset has exactly one rule per producible (kind, direction) pair, and every id matches its kind and direction.
- Direction symmetry: for each narrowing/widening pair, the request and response judgements mirror each other.
- Documentation-only changes are never dangerous, verifiable or additive.
- The loader rejects duplicates, incomplete rulesets, bad versions and out-of-range confidence parameters.
- The policy schema rejects missing targets, short reasons, bad dates and other formats.
- The committed JSON Schemas equal the generated ones.

## Questions an examiner might ask

- **Why no condition language in the rules, as ADR-0005 first planned?** Every condition we needed turned out to be either part of the change kind (required vs optional, 2xx vs 4xx) or the fixed evidence policy. A condition language would let a data file override "BREAKING needs evidence", which must not be configurable. The amendment in ADR-0005 records this.
- **Why JSON rather than YAML for the default ruleset?** It is imported directly with an import attribute, with no build step. Project files can be YAML or JSON.
- **Can a project hide a real break forever?** No. A suppression needs a reason and an expiry date, is reported, and is ignored once expired. A project ruleset that marks a dangerous change safe changes the rules hash, which every report shows.
- **Why is removing a parameter not verifiable?** Servers usually ignore unknown query parameters, so a request that still sends it passes validation. The break is behavioural (the parameter's effect is lost), so it stays RISKY instead of pretending to be proven either way.
