# @drift/core — the engine

**Owners:**

- Stage 1 Ingest, 3 Corpus, 4 Verify: P3 (Tanishq Chavan).
- Stage 2 Diff, 5 Classify, 6 Report & Gate: P4 (Pruthvi Gangapure).

**Status:** M6 — all six stages are implemented. `compare` runs them in order, reuses cached stage outputs, reports each stage's start and finish (`onStage`, for live runs), and produces a `drift-report/v1` report that `renderReport` turns into console, Markdown, HTML, SARIF or JUnit. Ingest results can be snapshotted and revived, so the platform caches them by file hash.

## Purpose

The pure engine that compares two OpenAPI contracts and, from M2, backs each label with evidence. Every other package calls it; none re-implements it. It does no I/O of its own: files come through the injected `SpecReader`.

## Public API

| Export                                                                                         | What it does                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingestSpec(path, { reader, refRoot?, limits?, displayPath? })`                                | Stage 1. Returns `{ spec?, diagnostics }`; `spec` only when there are no errors. Never throws for bad input.                                                                                                                          |
| `diffSpecs(baseIR, headIR)`                                                                    | Stage 2. Returns `{ changes, impact, anchors }`: sorted `Change` records, operation → change ids, and where each change sits (internal).                                                                                              |
| `compare({ base, head, traffic?, ruleset?, policy?, failOn?, asOf, seed?, cache?, onStage? })` | Runs Diff → Corpus → Verify → Classify and returns a schema-validated `drift-report/v1` report. `onStage` is told when each stage starts and finishes (`StageEvent`: stage, key, cached); it is awaited and cannot change the result. |
| `snapshotSpec(spec)`, `reviveSpec(snapshot, sources)`                                          | An ingested contract as JSON (`drift-spec-snapshot/v1`), and back. Revive checks the snapshot's shape and that its IR still hashes to its spec hash; anything else is a cache miss.                                                   |
| `readJsonl(lines)`, `readHar(document)`                                                        | Traffic readers: an async stream of `drift-traffic/v1` lines, or a HAR 1.2 document.                                                                                                                                                  |
| `buildCorpus`, `verify`, `classify`, `assess`                                                  | Stages 3–5, exported for tests, the worker and the M6 re-runs.                                                                                                                                                                        |
| `redactSample`, `detect`, `DEFAULT_REDACTION`                                                  | Redaction and the secret/PII detectors.                                                                                                                                                                                               |
| `stageKey(stage, inputs)`, `specSummary(spec)`                                                 | Content-addressed stage keys (ADR-0006) and report summaries.                                                                                                                                                                         |
| `evidenceSummary(change)`, `omittedBody(example)`                                              | The one-line evidence text and the note for a sample body left out of a report, shared by every report format and the web UI's change page.                                                                                           |
| `parseDataText`, `parseRuleset`, `Policy`, `DEFAULT_RULESET`, `DEFAULT_POLICY`                 | Safe YAML/JSON parsing and the rules/policy loaders, re-exported so callers depend on core only.                                                                                                                                      |
| `SpecReader`, `IngestLimits`, `DEFAULT_LIMITS`                                                 | The file adapter the caller provides, and the resource limits.                                                                                                                                                                        |
| `SpecIR`, `OperationIR`, `NormalizedSchema`, …                                                 | IR types.                                                                                                                                                                                                                             |
| `canonicalJson`, `contentHash`, `sha256Hex`                                                    | RFC 8785 canonical JSON and hashing (ADR-0006).                                                                                                                                                                                       |
| `changeId`                                                                                     | The stable change id function.                                                                                                                                                                                                        |
| `ENGINE_NAME`, `ENGINE_VERSION`                                                                | Engine identity, kept equal to package.json by a test.                                                                                                                                                                                |

## Data flow

```
spec file ──▶ loadDocumentSet ──▶ detectVersion ──▶ validateStructure ──▶ buildIR ──▶ contentHash
             (parse, limits,      (3.0.x / 3.1.x)   (official schema,      (operations,   (spec hash)
              local $refs only)                      located errors)        normalised
                                                                             schemas)
base IR ─┐
         ├──▶ diffSpecs ──▶ Change[] + impact index + anchors
head IR ─┘                       │
traffic ──▶ readJsonl/readHar ──▶ buildCorpus ──▶ redacted, sampled samples of affected operations
                                 │                (routed against the old contract)
                                 ▼
                              verify ──▶ per-change evidence (+ synthetic samples where traffic is missing)
                                 │
rules + policy ─────────────▶ classify ──▶ BREAKING / RISKY / SAFE, confidence, semver, gate ──▶ Report
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
- **Cycles and cost:** reference pairs are compared like a graph search (Tarjan's strongly connected components). Meeting a pair that is still open stops there. When the first pair of a cycle finishes, its result holds everything reachable from it, and every pair in that cycle gets exactly that result in the cache. Each pair is compared once per direction, however densely components refer to each other. Before this (M1 fixtures job), Stripe's `anyOf: [string, $ref]` expandable fields made the diff exponential, because results inside a cycle were never cached.
- **Output:** changes are de-duplicated by id and sorted by operation, direction, location, kind and subject.

## Stage 3 — Corpus (`src/corpus/`)

| File            | Role                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traffic.ts`    | `drift-traffic/v1` JSONL, read one line at a time (lines over 4 MiB are refused unparsed), and HAR import. Malformed input is counted and reported by line number, and the reason never quotes the line.                                                                                                                                             |
| `router.ts`     | Matches recorded paths to operations: server base paths stripped (longest first), then a trie of path templates in which literal segments win over parameters. Mixed segments such as `{id}.json` are supported.                                                                                                                                     |
| `redact.ts`     | Denylisted headers (`authorization`, cookies, API-key headers) and field names (`password`, `token`, …), plus detectors for emails, JWTs, bearer tokens, common cloud keys, private keys and Luhn-valid card numbers. Every quantifier is bounded, so long input cannot cause catastrophic backtracking. Every redacted value's pointer is recorded. |
| `corpus.ts`     | The stage: route against the **old** contract, keep only operations in the impact index, keep per operation the samples with the lowest priority hash (deterministic, independent of line order), share the global cap in turns across operations, then redact every kept sample.                                                                    |
| `synthesize.ts` | The deterministic sample generator (below).                                                                                                                                                                                                                                                                                                          |

**Synthetic samples** use no randomness. Every schema node offers a short list of variants: each enum value, the typical value and both bounds of a number, the shortest and longest strings, format examples, all properties or only the required ones or one extra, each `oneOf`/`anyOf` branch, and so on. A _plan_ picks one variant per node. For each group (an operation's requests, or one response status and media type), plans run in this order:

1. a baseline, and, when it misses a node a change touches, one plan **steered** there: `SchemaGenerator.routes` walks the schema graph back from the changed nodes and picks, at each decision on the way, the first variant that leads there (for example the object branch of Stripe's expandable `anyOf: [id, object]` fields);
2. every variant of each node a change touches (the "focus" points, from the change anchors);
3. sweeps;
4. a fill, so that every variant of every node reached is generated at least once.

Steps 1–2 stop at 48 per group. Steps 3–4 stop at the group's share of the **synthetic budget**: 4,096 samples per comparison, divided evenly between the groups before any sample is generated (at most 48 each). It is counted in samples, not time, so a report is still a function of its inputs. A change to a component shared by hundreds of operations therefore costs a few samples per operation instead of 48, and the report says so (`SYNTHETIC_BUDGET`).

This makes samples change-directed without per-change code. For a removed enum value, the old schema offers that value; for a tightened bound, it offers the old bound. Every sample is validated against the contract it was generated from and discarded if that contract rejects it, so the generator's shortcuts (for example with `pattern`) can never produce false evidence.

**Strings with a `pattern`** (`pattern.ts`): the usual candidates are tried first; if none matches, a string is built from the regular expression itself (the first branch of each alternation, a fixed character from each class, quantifiers at their minimum and grown to `minLength`). It covers the subset API patterns use in practice (ids, hashes, codes, dates); lookarounds and back-references give up. Before M4, a request with a commit-hash field could not be generated at all, so no change in it could be proven. A property test checks that every string it builds matches its pattern.

## Stage 4 — Verify (`src/verify/`)

- **Request direction:** a sample is evidence for a change when the **old** contract accepts it and the **new** one rejects it for a reason that change explains.
  - Recorded samples come from the corpus.
  - An affected operation that no recorded sample reached gets synthetic samples generated from the old contract.
- **Response direction:** samples are generated from the **new** response schema and validated against the **old** one, for each status and media type both contracts share. Recorded responses are checked against the new contract for information only (`nonConformance.responses`).
- **Attribution** (`attribution.ts`): the diff records, for every change, the pair of schema nodes it was found at and which part of the message it sits in (a parameter, a body media type or a response). Ajv reports the node that rejected a value (`parentSchema.$source`), so a failure is attributed to a change when:
  - the part matches;
  - the node matches on the side being validated;
  - the keyword and value fit the kind of change: an `enum` failure with the removed value, `required` with the added property name, `maximum` for a tightened maximum, and so on.
    Failures no change explains are reported as `unattributed` instead of being hidden.
- **Redaction and evidence:** a failure at a redacted value or inside one is _unknown_, never failing (risk R6). So is a failure above one, for keywords that look at nested values (`oneOf`, `enum`, `uniqueItems`, …).
- **Validators** (`validators.ts`): Ajv 2020, compiled once per (operation, direction, part, media type) per contract and cached, with a counter so tests can assert this. Components are added once per direction. `readOnly` properties are not required in requests and `writeOnly` ones not in responses. A schema that cannot be compiled is noted in the report, not fatal.
- **Examples in reports:** up to three failing samples per change. A body over 8 KiB is left out and replaced by `bodyOmitted`: its size and the value at each error pointer (values up to 1 KiB). Without this, one change to Stripe's `account` put three full generated responses per operation, for 612 operations, into the report.
- **Contract checks** (`contract.ts`): `ContractChecker.check(exchange)` validates one real request and response against a contract with the same validators and router, and reports what does not follow it (an unknown operation, a rejected parameter or body, an undocumented status or media type, a rejected response body). DRIFT's own API tests use it against `apps/web/openapi/drift-api.yaml`.
- **Wire values** (`wire.ts`): query, path, header and cookie values are text on the wire. Each contract decodes them with its own schema (numbers, booleans, arrays from repeated keys or commas), as its server would.

## Stage 5 — Classify (`src/classify/`)

- **Label** (ADR-0002): failing evidence → BREAKING; otherwise the rule's structural judgement: dangerous → RISKY, safe → SAFE. Missing evidence never gives SAFE; a property test checks this for every dangerous rule.
- **Confidence** (ADR-0002, M2 amendment), with n = recorded samples that reached the change:
  - recorded failing → 1;
  - synthetic-only failing → 0.8 · 2^(−n/20);
  - no failing evidence → max(0, 1 − 3/n);
  - not verifiable → null.
    `unverified` means n = 0.
- **Policy:** escalations (SAFE → RISKY), suppressions with reason and expiry (ignored and reported when expired, reported when unused), `failOn`.
- **Semver:** major if anything is BREAKING (or RISKY, unless `riskyIsMajor: false`), minor if any rule is additive, patch otherwise.

## Stage 6 — Report (`src/report/`)

| Format    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `console` | Grouped by label; each change with its rule, `file:line:col`, evidence and first failing sample. ANSI colour only when the caller asks for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `json`    | The `drift-report/v1` document itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `md`      | PR comment or job summary. Starts with the hidden marker `<!-- drift-report -->` so the Action updates one comment. BREAKING changes are shown in full; RISKY and SAFE are in collapsed tables; suppressed changes (any label) are one collapsed table with their expiry and reason, so the sections agree with the counts at the top. With `maxLength` (a GitHub comment holds 65,536 characters), changes are listed in order while they fit, and a note says how many of each label were left out. Every untrusted value is escaped; code values go in `<code>` elements with escaped content; payloads go in fences longer than any backtick run inside them. |
| `html`    | One self-contained file: no scripts and no external assets. CSP `default-src 'none'` plus the page's own stylesheet by SHA-256; every value escaped. Visual design: P1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `sarif`   | SARIF 2.1.0 for code scanning. BREAKING → error and RISKY → warning, at the line of the spec that changed (`%SRCROOT%`-relative). The change id is a partial fingerprint, and suppressions map to SARIF suppressions. SAFE changes are left out. Tests validate the output against the official OASIS schema.                                                                                                                                                                                                                                                                                                                                                     |
| `junit`   | One test suite per operation, one test case per change. A change that fails the gate is a failure; a suppressed change is skipped. XML-escaped, with forbidden control characters removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Positions:** `IngestedSpec.locate(location)` finds a change's `file:line:col` with the lazy position index (ADR-0003). Every change in the report carries it as `position`.

## Stage keys (ADR-0006)

`compare` records a content-addressed key for every stage: `sha256(JCS({ stage, engine, inputs }))`. The inputs are:

| Stage    | Inputs                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| Ingest   | The hash of the parsed documents.                                                        |
| Diff     | The two spec hashes.                                                                     |
| Corpus   | The diff key, the traffic file's SHA-256, the caps, the seed and the redaction settings. |
| Verify   | The diff and corpus keys, and the options.                                               |
| Classify | The verify key, the rules and policy hashes, the date and `failOn`.                      |

A test checks that changing the seed changes the Corpus key but not the Diff key, and that changing `failOn` changes only Classify.

**Cache.** `compare({ cache })` takes a `StageCache` adapter (`get(hash)`, `put(hash, value)`):

- Before running Diff, Corpus, Verify or Classify, it looks the stage up by its key. A hit is reused and marked `cached: true` in `stages`.
- Traffic is an `open()` function, called only on a Corpus miss, so a cached re-run does not read the traffic file at all.
- A damaged entry is a miss, and is recomputed and overwritten.
- The CLI's adapter is `.drift/cache/` (see cli.md). The worker's adapter is object storage, per organisation (`orgs/<org>/stages/<key>.json`, see worker.md).
- In the CLI, Ingest is not cached: its key (the hash of the parsed documents) is only known after parsing, which is most of its cost. The worker knows each uploaded file's SHA-256 before parsing, so it caches Ingest under `stageKey("ingest.file", { sha256, name })` as a snapshot, and marks the stage `cached` in the report (`IngestedSpec.cached`).

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
- **Corpus:** JSONL and HAR reading (malformed reasons never contain the input), routing, sampling (caps, fair sharing, independence from input order, seed), and redaction of every detector kind. Fake secrets are assembled at run time, and a timing test runs the detectors on adversarial input.
- **Generator:** the variants of every schema form, allOf merging, readOnly/writeOnly, endless required recursion.
- **Verify:** one case per kind of provable change, from synthetic samples and from recorded ones; unknown at redacted values; non-conformance; unattributed failures; compile-once counter.
- **Classify:** the confidence formula, escalation, suppressions (id, glob, expired, unused), semver, gate, and the property "a dangerous change without failing evidence is never SAFE".
- **Report formats (`report/render.test.ts`):**
  - SARIF, with and without traffic, is valid against the official schema, and so is the CLI's golden `examples/petstore/expected.sarif`.
  - The HTML has no scripts or external URLs, and its CSP hash matches its stylesheet.
  - A report whose every string is hostile (script tags, Markdown links, backtick fences, control characters) is neutralised in every format.
- **Cache:** a second run reuses Diff, Corpus, Verify and Classify without opening the traffic; a new policy re-runs only Classify; damaged entries are recomputed. `onStage` sees every stage start and finish in order, with `cached` matching the report.
- **Snapshots (`ingest/snapshot.test.ts`):** a revived contract gives the same report as a freshly ingested one, including source positions; damaged, foreign-format or tampered snapshots are refused.
- **Pipeline (`compare.test.ts`):** the M2 acceptance runs on `examples/petstore` (BREAKING with a redacted recorded payload; synthetic evidence without traffic; an additive change passes), the redaction canary (no planted secret reaches the report), determinism, stage keys and HAR input.

## Known limitations

- Not in the IR yet: 3.1 `webhooks`, callbacks, links and response headers. Only the root `servers` are used for routing; path- and operation-level `servers` are not.
- Verify runs on the main thread. The worker pool of PLAN §4.4 moves to M3, where the performance benchmark can show whether it pays off.
- Bodies are validated for JSON and `text/*` media types only; form, XML and binary bodies are not checked. Stripe sends every request body as `application/x-www-form-urlencoded`, so request-body changes there stay RISKY (found by the first benchmark run).
- Generated long strings stop at 1,024 characters, so a `maxLength` tightened from 5,000 to 2,000 cannot be proven.
- Below depth 8 the generator takes the first variant everywhere, so a steered plan cannot reach a changed node deeper than that; such a change stays RISKY unless recorded traffic reaches it.
- A change of `items` to a referenced component attributes failures only when they are reported under `…/items` of the node; failures elsewhere show up as unattributed.
- Response evidence is always synthetic, because recorded responses come from the old server.
- `$ref` to `#anchor` fragments and `$id`-based references are rejected (`REF_UNSUPPORTED`).
- OpenAPI 3.2 is rejected (`UNSUPPORTED_VERSION`).
- JSON input with duplicate keys keeps the last value (`JSON.parse` semantics). YAML duplicates are errors.
- Removing `minimum` while adding an equal `exclusiveMinimum` is reported as two bound changes (one relaxed, one tightened), not as one net change.
- A `$ref` inside a property literally named `example` is followed only because property names are recognised as names. Other literal-data positions are skipped by key.

## Questions an examiner might ask

- **A pull request controls the spec. Could it inject script into the HTML report or the PR comment?** Every value is escaped for its format. The HTML page has no scripts, and its CSP (`default-src 'none'` plus one hashed stylesheet) would block injected ones anyway. In Markdown, links, HTML and emphasis are escaped, and payloads sit in fences that are always longer than any backtick run inside them. A test builds a report whose every string is hostile and checks each format.
- **Why is SAFE left out of SARIF?** Code scanning is a list of problems to fix. SAFE changes stay in every other format.
- **Why does the worker cache Ingest but the CLI does not?** The worker's inputs are single uploaded files whose SHA-256 is known up front, so it can look up a snapshot before parsing. A revived snapshot must still hash to its own spec hash, so a tampered entry is recomputed, not trusted.
- **Can the cache return a stale result?** Only if the engine code changes without its version changing. Keys hash every input, the engine version, and the rules and policy hashes. The CLI docs tell developers to use `--no-cache` while editing the engine.

- **How do you know which change a failing sample proves?** The diff records the pair of schema nodes each change was found at. Ajv reports the node that rejected the value, and attribution checks that node, the part of the message and the keyword (for a removed enum value, also the value itself). Anything that fails without a matching change is reported as unattributed, so the mechanism cannot silently blame the wrong change.
- **Can redaction create a false BREAKING?** No. A failure at, inside, or (for value-dependent keywords) above a redacted value is unknown, never failing. A test changes an email format and sends a redacted email: the result is unknown, not failing.
- **Can the generator produce false evidence?** No. A generated sample counts only if the contract it was generated from accepts it. Generation shortcuts can only cost coverage, never correctness.
- **Why are synthetic labels less confident?** A synthetic sample shows that _some_ valid request breaks, not that any real client sends it. Confidence 0.8 halves for every 20 recorded samples that reach the change without failing.
- **How do you sample a million lines without keeping them?** Per operation, only the samples with the lowest priority hash are kept, and the list is trimmed whenever it doubles. Memory is bounded by the caps, and the kept set does not depend on line order.

- **How do you know a spec diffed with itself gives nothing, beyond the examples?** A property test generates random valid specs, including mutually recursive components, and asserts an empty diff against the spec itself and against a copy with every key reversed.
- **Renaming `/users/{id}` to `/users/{userId}` — is that breaking?** No. The operation key erases parameter names, and path parameters are matched by position, so it is one SAFE `path.param.renamed`.
- **Why is adding an enum value RISKY in a response but SAFE in a request?** A server accepting a new value cannot break a client, but a client that validates responses strictly can reject a value it has never seen. The table is in `@drift/rules` and is checked for this request/response symmetry by a test.
- **What if the same component is used in five operations?** It is compared once per direction (memoised), and the change is reported once per operation that reaches it, with that operation in the change id. So the impact index is exact.
- **What if one change reaches hundreds of operations?** The first benchmark run found this: adding an enum value to Stripe's `account` touches all 612 operations, and generating 48 responses for each of 964 response groups made the benchmark hit its 60-minute limit. Synthetic samples now share a fixed budget (counted in samples, so reports stay deterministic). The samples aimed at the change always run, and a steered plan reaches the changed node through fields that would otherwise generate an id string. All 612 changes of that mutant are now proven (timings in `docs/EVALUATION.md`), and a regression test builds a smaller spec of the same shape.
- **How do you avoid infinite recursion on `Node.children: Node[]`?** Components stay references in the IR. The differ tracks the reference pairs it has open and stops when it meets one again.
- **And how do you avoid exponential time on specs like Stripe's, where hundreds of components refer to each other?** That was a real bug, found by the fixtures job: the first version cached only results that no cycle had cut short, and in a dense cycle almost nothing qualified. Now the differ finds strongly connected components as it goes (Tarjan). Every pair in a cycle reaches every other, so they share one complete result, cached when the cycle's first pair finishes. A regression test with 40 components linked five ways each runs in well under a second.
- **Why does `allOf` merging not change behaviour?** It only merges when it is provably equivalent: object-only keywords, no conflicting property definitions, and a non-empty type intersection. Anything else keeps the `allOf`, and the differ compares it member by member.
