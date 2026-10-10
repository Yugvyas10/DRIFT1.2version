# ADR-0003: OpenAPI parsing, validation and `$ref` resolution

Status: Accepted (2026-09-26, M1). Supersedes the Proposed version, which planned to pick a bundler library in a spike.
Date: 2026-09-26
Owner: P3

## Context

Ingest must:

- load OAS 3.0 and 3.1 from YAML or JSON;
- report _located_ errors (`file:line:col`), including in referenced files;
- resolve internal refs, and local-file refs only inside an allowlisted root;
- refuse remote refs (SSRF);
- survive circular refs;
- stay safe against YAML resource exhaustion;
- scale to real specs: the GitHub and Stripe descriptions are several megabytes each.

The Proposed version of this ADR planned a spike between two bundler libraries (`@apidevtools/json-schema-ref-parser`, `@redocly/openapi-core`). The M1 spike on the pinned fixtures (`packages/bench`) settled the design differently. Both libraries resolve references over plain JavaScript objects, and neither gives us what we need:

- **Positions.** Once a value has been parsed into a plain object, its line and column are gone. We need them for diagnostics and SARIF (M3).
- **Resolution.** Our IR builder must resolve refs lazily, keeping component identity so recursive schemas stay finite, not bundle or dereference ahead of time.

The resolution we need is small, and it is security-critical, so we want it in code we can test and explain.

## Decision

- **Parsing** (`ingest/parse.ts`):
  - JSON-looking input goes through `JSON.parse`, which is fast.
  - YAML, and JSON that fails to parse, goes through `yaml` (YAML 1.2, `uniqueKeys`, alias expansion capped by `maxAliasCount`), which reports errors with positions.
  - After parsing, an iterative depth check enforces `maxDepth`.
- **Positions** (`ingest/positions.ts`): a `PositionIndex` per file re-parses the text into a YAML syntax tree **lazily**, on the first lookup only. Diagnostics are rare, and the tree is large, so valid specs never pay that memory.
- **Loading** (`ingest/documents.ts`):
  - breadth-first over `$ref`s that point to local files;
  - each target is resolved with the reader's `realpath`, so symlinks count, and must be inside `--ref-root` (default: the spec's directory);
  - `http(s)` refs produce `REF_REMOTE_DISALLOWED` and other schemes `REF_UNSUPPORTED`; there is **no network code path at all**;
  - limits on file size (checked with `size()` before reading), total bytes and file count;
  - refs inside literal data (`example`, `default`, `enum`, `const`, `x-*`) are not followed.
- **Resolution** (`ingest/refs.ts`): synchronous lookups over the loaded set. Each target gets a stable id in the same format as change locations: `#/pointer` for the root document, `relative/file.yaml#/pointer` for other files. `#anchor` fragments are rejected as `REF_UNSUPPORTED`.
- **Validation** (`ingest/validate.ts`):
  - the root document is validated with Ajv against the official schemas, vendored byte-for-byte in `ingest/oas-schemas/` (3.0 via `ajv-draft-04`, 3.1 via Ajv 2020);
  - Ajv 8's `$dynamicRef` bug is worked around by one documented, equivalent rewrite at load time (see `oas-schemas/README.md`);
  - errors are condensed (container and Reference-branch noise dropped) and capped.
- **Cycles:** the IR keeps component references as `{ "$ref": id }`. The normaliser handles each component once (queue plus state map), and the diff walks pairs with a stack. Nothing is ever fully dereferenced.
- **Remote refs** stay refused. A future `--allow-remote-refs` would need an allowlist of hosts, size limits and timeouts, and its own ADR.

## Alternatives considered

- **`@apidevtools/json-schema-ref-parser`** (with `resolve.http: false` and a custom file resolver). Rejected: it works on plain objects, so positions are lost across files, and dereferencing is its core mode, which expands recursive schemas.
- **`@redocly/openapi-core`**. It keeps positions, but brings a large dependency tree and a lint and config model we would have to explain and constrain. Its resolver fetches over HTTP unless configured not to.
- **`@apidevtools/swagger-parser` alone.** Rejected: no positions, and dereferencing risks blow-ups on circular schemas.

## Consequences

- About 400 lines of our own loading and resolution code, covered by security tests:
  - remote ref, other scheme, `../` escape and symlink escape are all refused, and the target is never read;
  - oversize files, total bytes, too many files, alias bomb and deep nesting all stop cleanly.
- Real-world findings from the fixtures are now handled:
  - GitHub's spec defines the same path template twice with disjoint methods. This is a warning, and a clash only on the same method is an error.
  - Ajv's `$dynamicRef` problem with the official 3.1 schema is worked around.
- Performance is measured, not asserted: `pnpm --filter @drift/bench run fixtures:check` records ingest and diff timings per fixture in `results/fixtures.json` (a CI artifact). The M3 performance harness turns these into `docs/EVALUATION.md`.

## Questions an examiner might ask

- _Why not fetch remote refs?_ A CI job fetching arbitrary URLs from a PR-controlled file is an SSRF and exfiltration vector. The loader has no HTTP code at all.
- _How do you stop `$ref: ../../etc/passwd` or a symlink trick?_ Every target is resolved with `realpath` and must be inside the ref root. Tests plant a secret outside the root and assert it is never read.
- _Why re-parse to get positions instead of keeping the syntax tree?_ The tree is several times larger than the parsed value, and valid specs never need it. Re-parsing only happens when there is something to report.
- _How do you handle a schema that references itself?_ Components stay as refs in the IR. The diff tracks the pairs it is comparing and stops when it meets one again.
