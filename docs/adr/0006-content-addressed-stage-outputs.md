# ADR-0006: Typed, content-addressed stage outputs

Status: Accepted (2026-09-26)
Date: 2026-09-26
Owner: P3 (with P4 for the Classify/Report stages)

## Context

Deck objective 3 (replay a stage with modified inputs) and the performance goals both need stage outputs that can be stored, reused, and trusted to be up to date. Timestamps or run ids as cache keys give stale results.

## Decision

- Each stage is a pure function from typed inputs to a typed output (zod schema per stage).
- `cacheKey = sha256(JCS({ stage, engineVersion, rulesVersion (Classify/Report), policyHash (Classify/Report), inputHashes }))`, where `inputHashes` are the cache keys or content hashes of upstream outputs and raw inputs (spec bytes, corpus bytes, config). JCS (RFC 8785) canonical JSON makes the hash independent of key order.
- A storage adapter interface (`get(key)`, `put(key, bytes)`, `has(key)`) with two implementations: a local filesystem cache (`.drift/cache/`, CLI) and S3-compatible storage (platform). In the platform, keys are prefixed with the org id, so identical content in two orgs never shares an object (no cross-tenant probing).
- A re-run creates a child run. Stages whose `cacheKey` is unchanged are marked `cacheHit: true` and not recomputed.

## Alternatives considered

- **Caching by run id or timestamp.** Cannot tell when inputs changed.
- **Global cross-tenant dedup.** Saves storage, but leaks whether another org has uploaded identical content.

## Consequences

- Engine or rules version bumps invalidate the relevant caches automatically.
- Stage outputs must be deterministic. Property tests assert byte-identical output for identical inputs, and synthetic generation is seeded.

## Questions an examiner might ask

- _How do you know a cached Diff output is still valid?_ Its key includes both spec content hashes and the engine version. If any of them changes, the key changes.
- _Why canonical JSON?_ `{"a":1,"b":2}` and `{"b":2,"a":1}` must hash identically.
