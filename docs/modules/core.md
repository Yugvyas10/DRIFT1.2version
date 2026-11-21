# @drift/core — the engine

**Owners:** stage 1 Ingest, 3 Corpus, 4 Verify: P3 (Tanishq Chavan). Stage 2 Diff, 5 Classify, 6 Report & Gate: P4 (Pruthvi Gangapure).
**Status:** M0 — hashing foundation only. The stages arrive in M1–M3.

## Purpose

The pure engine that compares two OpenAPI contracts and produces evidence-backed labels. Every other package calls it; none re-implements it.

## Public API (M0)

| Export                          | What it does                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `canonicalJson(value)`          | RFC 8785 canonical JSON: sorted keys (UTF-16 order), ECMAScript number format, no whitespace.            |
| `CanonicalJsonError`            | Thrown for non-JSON input. `path` locates the offending value (e.g. `$.a[2]`).                           |
| `contentHash(value)`            | SHA-256 (hex) of the canonical form. Equal data → equal hash, whatever the key order.                    |
| `sha256Hex(data)`               | SHA-256 of a UTF-8 string or bytes.                                                                      |
| `ENGINE_NAME`, `ENGINE_VERSION` | Engine identity, recorded in every report and cache key. A test keeps the version equal to package.json. |

## Data flow

Planned: specs → Ingest (IR + spec hash) → Diff (changes + impact index) → Corpus (samples) → Verify (evidence) → Classify (labels) → Report. Each stage output has `cacheKey = contentHash({stage, engineVersion, …inputHashes})` (ADR-0006).

## Key design decisions

- **Purity is enforced by lint:** no file, network or process modules, no infrastructure or UI libraries, and no `Math.random` in `src/` (see `eslint.config.mjs`). I/O arrives through adapters passed in by the caller.
- **Strict rejection over silent conversion:** `canonicalJson` throws on `NaN`, `Infinity`, `bigint`, `Date`, `Map`, `undefined` array items, lone surrogates and cycles. `JSON.stringify` would turn some of these into `null` or `{}`, so two different values could hash the same.
- **`undefined` object properties are omitted,** as `JSON.stringify` does, so optional TypeScript fields do not change a hash.

## Known limitations

- `canonicalJson` is recursive. Nesting deeper than the JavaScript stack allows (thousands of levels) would overflow. Ingest's nesting-depth limit (M1) bounds this for real inputs.

## Questions an examiner might ask

- **Why canonical JSON rather than `JSON.stringify`?** `JSON.stringify` keeps insertion order, so `{a:1,b:2}` and `{b:2,a:1}` would hash differently even though they are the same data. RFC 8785 fixes the key order and number format.
- **Why sort keys by UTF-16 code units, not code points?** RFC 8785 §3.2.3 requires it. The test with 😀 (a surrogate pair) versus U+FB33 shows the difference: in UTF-16 order the emoji sorts first.
- **How do you know the implementation is right?** It passes the RFC 8785 test vectors, plus fast-check property tests over random JSON: round-trip, idempotence and key-order independence.
- **Why is `node:crypto` allowed in a "pure" package?** Hashing is a deterministic computation with no I/O. The ban covers file, network and process access.
