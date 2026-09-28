# Examples

Small, hand-written OpenAPI documents used by the golden tests, the docs and (from M7) the DEMO seed.

| Directory      | Used for                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid/`       | Specs that `drift validate` accepts: OpenAPI 3.0, 3.1 and a multi-file spec with local `$ref`s                                                                         |
| `invalid/`     | One problem each; `expected.txt` holds the exact `drift validate` output                                                                                               |
| `diff/<case>/` | `base.yaml` → `head.yaml` pairs; `expected.json` holds the exact change set (`drift diff --format json`, changes only)                                                 |
| `petstore/`    | The M2 acceptance example: `v1.yaml` → `v2-breaking.yaml` (and `v2-additive.yaml`), with `traffic.jsonl`; `expected*.{json,txt}` hold the exact `drift compare` output |

`petstore/traffic.jsonl` deliberately contains fake secrets and personal data (a JWT, email addresses, card numbers and cloud-key-shaped strings, some inside a malformed line). They prove that redaction keeps them out of every report; `.gitleaks.toml` allowlists this one file for that reason.

Regenerate the golden files after an intended behaviour change with `UPDATE_GOLDEN=1 pnpm --filter @drift/core test`, then review the diff of the golden files like any other code change.
