# SARIF 2.1.0 JSON Schema (test only)

`sarif-schema-2.1.0.json` is the official OASIS schema, copied byte for byte. The SARIF test validates `drift compare --format sarif` output against it. It is not imported by any runtime code and is not part of the built package.

|         |                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| Source  | [oasis-tcs/sarif-spec](https://github.com/oasis-tcs/sarif-spec), `sarif-2.1/schema/sarif-schema-2.1.0.json` |
| Commit  | `adbb670c018335b0f384e6dd8819f4ea055d7ee1` (2026-09-18)                                                     |
| SHA-256 | `c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e`                                          |
| Licence | OASIS IPR Policy (RF on RAND terms), as stated in the repository's `LICENSE.md`                             |
| Dialect | JSON Schema draft-04 (validated with `ajv-draft-04`)                                                        |
