# ADR-0003: OpenAPI parsing, validation and `$ref` resolution

Status: Proposed. The bundler choice is confirmed by an M1 spike on the GitHub and Stripe fixtures, and this ADR is updated with the bench output.
Date: 2026-09-26
Owner: P3

## Context

Ingest must:

- load OAS 3.0 and 3.1 from YAML or JSON;
- report _located_ errors;
- resolve internal refs, and local-file refs only inside an allowlisted root;
- refuse remote refs by default (SSRF);
- survive circular refs;
- stay safe against YAML resource exhaustion.

Most OpenAPI libraries validate without line numbers, and several fetch remote refs by default.

## Decision

- **Parsing:** the `yaml` package, with `LineCounter` for positions, `maxAliasCount` limited, and our own limits on file size and nesting depth. JSON goes through the same parser (JSON is valid YAML 1.2), so positions come for free.
- **Document validation:** ajv against the official OpenAPI JSON Schemas (3.0 uses draft-04 via `ajv-draft-04`; 3.1 uses draft 2020-12). We map ajv `instancePath` to source positions to produce `file:line:col` errors.
- **Bundling external refs:** a library resolver configured with HTTP resolution **disabled** and a file resolver that refuses any path outside `--ref-root` (after `realpath`, so symlink escapes are caught). Candidates:
  - `@apidevtools/json-schema-ref-parser` (`resolve.http: false`, custom `file.canRead`), or
  - `@redocly/openapi-core` `bundle()` with a custom resolver.
    The M1 spike picks one on correctness, time and memory for the large fixtures.
- **Circular refs:** never fully dereferenced. The IR keeps refs as named nodes, and the diff walks them with a visited set.
- **Remote refs:** a hard error unless `--allow-remote-refs` is given. Even then there are only GET requests, an allowlist of hosts, size limits and timeouts. Remote refs are out of scope until after M8.

## Alternatives considered

- **`@apidevtools/swagger-parser` alone.** It validates and dereferences, but its errors have no source positions. Full dereferencing also risks blow-ups on circular schemas.
- **Writing our own external-ref bundler.** Possible, but security-critical and full of edge cases. A mature library with the dangerous resolvers disabled is the boring choice. Our own code is limited to internal-ref walking in the IR.

## Consequences

- We vendor the official OAS JSON Schemas (Apache-2.0) with their licence notice.
- Security tests are required: remote ref refused, `../` escape refused, symlink escape refused, alias bomb refused, oversize refused.

## Questions an examiner might ask

- _Why not fetch remote refs?_ A CI job fetching arbitrary URLs from a PR-controlled file is an SSRF and exfiltration vector.
- _How do you handle a schema that references itself?_ Refs stay as nodes, and diff/normalise use a visited set, so recursion terminates.
