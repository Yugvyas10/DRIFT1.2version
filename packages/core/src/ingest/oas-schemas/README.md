# Official OpenAPI JSON Schemas (vendored)

Used by Ingest to validate the structure of a root OpenAPI document (ADR-0003). The files are kept byte-for-byte as published.

| File                      | Source                                              | SHA-256                                                            |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `oas-3.0-2021-09-28.json` | https://spec.openapis.org/oas/3.0/schema/2021-09-28 | `7a0db7311a69d8b7f2505f59c5d4cbb58539a0961df0c05724a07538014822cf` |
| `oas-3.1-2022-10-07.json` | https://spec.openapis.org/oas/3.1/schema/2022-10-07 | `da01ba28852cac0de53893797cb8d1942bc3b05084f526dcc216717dec314ed0` |

Copyright The Linux Foundation / OpenAPI Initiative, licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Retrieved 2026-09-26.

## One adjustment at load time (not in the files)

Ajv 8 mis-evaluates `$dynamicRef` together with `unevaluatedProperties`: every Schema Object inherits the `unevaluatedProperties: false` of the surrounding Media Type, Parameter or Header object, so valid 3.1 documents fail. In this base 3.1 schema, `"$dynamicRef": "#meta"` always resolves to `#/$defs/schema` (nothing re-binds the `meta` anchor), so `src/ingest/validate.ts` replaces it with the equivalent `"$ref": "#/$defs/schema"` before compiling. `validate.test.ts` checks that valid 3.1 documents pass and invalid ones still fail.
