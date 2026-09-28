# Examples

Small, hand-written OpenAPI documents used by the golden tests, the docs and (from M7) the DEMO seed.

| Directory      | Used for                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `valid/`       | Specs that `drift validate` accepts: OpenAPI 3.0, 3.1 and a multi-file spec with local `$ref`s                         |
| `invalid/`     | One problem each; `expected.txt` holds the exact `drift validate` output                                               |
| `diff/<case>/` | `base.yaml` → `head.yaml` pairs; `expected.json` holds the exact change set (`drift diff --format json`, changes only) |

Regenerate the golden files after an intended behaviour change with `UPDATE_GOLDEN=1 pnpm --filter @drift/core test`, then review the diff of the golden files like any other code change.
