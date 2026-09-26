# @drift/core — the engine

**Owners:**

- Stage 1 Ingest, 3 Corpus, 4 Verify: P3 (Tanishq Chavan).
- Stage 2 Diff, 5 Classify, 6 Report & Gate: P4 (Pruthvi Gangapure).

**Status:** M1 — hashing, **Ingest** and **Diff** are implemented. Corpus, Verify and Classify arrive in M2, Report in M3.

## Purpose

The pure engine that compares two OpenAPI contracts and, from M2, backs each label with evidence. Every other package calls it; none re-implements it. It does no I/O of its own: files come through the injected `SpecReader`.

## Public API

| Export                                                          | What it does                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ingestSpec(path, { reader, refRoot?, limits?, displayPath? })` | Stage 1. Returns `{ spec?, diagnostics }`; `spec` only when there are no errors. Never throws for bad input. |
| `diffSpecs(baseIR, headIR)`                                     | Stage 2. Returns `{ changes, impact }`: sorted `Change` records, and operation → change ids.                 |
| `SpecReader`, `IngestLimits`, `DEFAULT_LIMITS`                  | The file adapter the caller provides, and the resource limits.                                               |
| `SpecIR`, `OperationIR`, `NormalizedSchema`, …                  | IR types.                                                                                                    |
| `canonicalJson`, `contentHash`, `sha256Hex`                     | RFC 8785 canonical JSON and hashing (ADR-0006).                                                              |
| `changeId`                                                      | The stable change id function.                                                                               |
| `ENGINE_NAME`, `ENGINE_VERSION`                                 | Engine identity, kept equal to package.json by a test.                                                       |

## Data flow

```
spec file ──▶ loadDocumentSet ──▶ detectVersion ──▶ validateStructure ──▶ buildIR ──▶ contentHash
             (parse, limits,      (3.0.x / 3.1.x)   (official schema,      (operations,   (spec hash)
              local $refs only)                      located errors)        normalised
                                                                             schemas)
base IR ─┐
         ├──▶ diffSpecs ──▶ Change[] + impact index
head IR ─┘
```

## Stage 1 — Ingest (`src/ingest/`)

| File           | Role                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `parse.ts`     | JSON via `JSON.parse`, YAML via `yaml`; duplicate keys, alias bombs and deep nesting become diagnostics                   |
| `positions.ts` | Lazy `PositionIndex`: turns reference tokens into line and column only when a diagnostic needs them                       |
| `documents.ts` | Loads the root and every local file it references; refuses remote refs and anything outside the ref root after `realpath` |
| `refs.ts`      | Synchronous `$ref` resolution; stable ids `#/pointer` or `file.yaml#/pointer`                                             |
| `validate.ts`  | Version detection and validation against the vendored official schemas, with readable, condensed errors                   |
| `normalize.ts` | Schema normalisation (below)                                                                                              |
| `build-ir.ts`  | Operations, parameters, bodies, responses, security → `SpecIR`                                                            |
| `ingest.ts`    | Orchestration and the spec hash                                                                                           |

**IR rules.**

- The operation key is `METHOD /template`, with path parameter names erased.
- Parameter keys:
  - path parameters by **position** (`path:0`), so a rename is not a removal;
  - headers by lower-cased name;
  - operation-level parameters override path-level ones.
- Media types are lower-cased with spaces removed.
- Security is the effective list: the operation's, else the global one.

**Schema normalisation.**

- `type` is always a sorted array; 3.0 `nullable: true` adds `"null"`.
- 3.0 boolean `exclusiveMinimum`/`exclusiveMaximum` become the numeric form.
- `allOf` is merged **only** when every member uses object-shaping keywords and no property conflicts; otherwise it is kept.
- 3.1 `$ref` with sibling keywords becomes an `allOf`; 3.0 siblings are ignored, as the spec says.
- Component references stay `{ "$ref": id }` and each component is normalised once, so recursive schemas stay finite.
- Examples and `x-` extensions are dropped.
- Every node records `$source`.

## Stage 2 — Diff (`src/diff/`)

- **Operations** are matched by key. A missing operation is `path.removed` if its whole template is gone, otherwise `operation.removed` (the same logic applies to additions).
- **Parameters:**
  - a parameter with the same name in a different location is `param.location_changed`;
  - required, deprecated and description changes are reported;
  - schemas are compared in the **request** direction.
- **Bodies and responses** are compared per media type, in the request and response direction respectively. Response statuses 4xx/5xx added are `response.error_status.added` (safe); any other added status is `response.status.added`.
- **Schemas** (`schema-diff.ts`):
  - types, where `integer` ⊂ `number`, give narrowed, widened or changed;
  - format;
  - enum and const values, one change per value;
  - numeric, length and item bounds, plus pattern, multipleOf and uniqueItems;
  - additionalProperties;
  - properties (added, removed, required changes): `readOnly` is skipped in requests and `writeOnly` in responses;
  - items and prefixItems;
  - oneOf/anyOf branches, matched by component id and then by content;
  - allOf, not and discriminator;
  - default, deprecated, title and description.
- **Direction semantics:** each change gets its candidate severity (RISKY/SAFE) from `STRUCTURAL_DEFAULTS` in `@drift/rules`. There is no severity logic in the engine.
- **Cycles and cost:** pairs of compared references sit on a stack, and meeting a pair again stops there. Results for a pair are memoised per direction, but only when no cycle cut them short, so each shared component is compared once across all operations.
- **Output:** changes are de-duplicated by id and sorted by operation, direction, location, kind and subject.

## Tests

- **Golden change sets:** `examples/diff/*/expected.json`, 18 pairs covering all 46 kinds.
- **Unit tests** for every Ingest module, with an in-memory `SpecReader` that supports symlinks.
- **Security tests:** remote ref, other schemes, `../` escape, symlink escape, oversize file, total size, file count, alias bomb, 200,000-level nesting.
- **Property tests** (fast-check, random valid specs with mutually recursive components):
  - a spec diffed with itself, or with a key-reordered copy, has no changes and the same hash;
  - output is deterministic;
  - ids are unique and match the impact index;
  - an added required query parameter is always RISKY;
  - schema normalisation is idempotent.
- **Real-world fixtures:** GitHub 3.0 and 3.1, Stripe, via `@drift/bench` (see [bench.md](bench.md)).

## Known limitations

- Not in the IR yet: 3.1 `webhooks`, callbacks, links, response headers and `servers` (routing arrives in M2).
- `$ref` to `#anchor` fragments and `$id`-based references are rejected (`REF_UNSUPPORTED`).
- OpenAPI 3.2 is rejected (`UNSUPPORTED_VERSION`).
- JSON input with duplicate keys keeps the last value (`JSON.parse` semantics). YAML duplicates are errors.
- Removing `minimum` while adding an equal `exclusiveMinimum` is reported as two bound changes (one relaxed, one tightened), not as one net change.
- A `$ref` inside a property literally named `example` is followed only because property names are recognised as names. Other literal-data positions are skipped by key.

## Questions an examiner might ask

- **How do you know a spec diffed with itself gives nothing, beyond the examples?** A property test generates random valid specs, including mutually recursive components, and asserts an empty diff against the spec itself and against a copy with every key reversed.
- **Renaming `/users/{id}` to `/users/{userId}` — is that breaking?** No. The operation key erases parameter names, and path parameters are matched by position, so it is one SAFE `path.param.renamed`.
- **Why is adding an enum value RISKY in a response but SAFE in a request?** A server accepting a new value cannot break a client, but a client that validates responses strictly can reject a value it has never seen. The table is in `@drift/rules` and is checked for this request/response symmetry by a test.
- **What if the same component is used in five operations?** It is compared once per direction (memoised), and the change is reported once per operation that reaches it, with that operation in the change id. So the impact index is exact.
- **How do you avoid infinite recursion on `Node.children: Node[]`?** Components stay references in the IR. The differ keeps a stack of the reference pairs it is comparing and stops when a pair repeats. Memoised results are only reused when no cycle cut them short (tested with mutual recursion reached from two entry points).
- **Why does `allOf` merging not change behaviour?** It only merges when it is provably equivalent: object-only keywords, no conflicting property definitions, and a non-empty type intersection. Anything else keeps the `allOf`, and the differ compares it member by member.
