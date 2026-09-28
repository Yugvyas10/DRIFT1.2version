# @drift/cli — the `drift` command

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M2 — `validate`, `diff` and `compare`. The remaining commands and report formats arrive in M3.

## Usage

```bash
drift validate examples/valid/petstore-3.0.yaml            # ✔ ... valid OpenAPI 3.0.3 (3 operations, 0 warnings), exit 0
drift validate examples/invalid/bad-response.yaml          # file:line:col  error  CODE  message, exit 2
drift validate <spec> --format json [--ref-root <dir>]
drift diff --base examples/diff/enums/base.yaml --head examples/diff/enums/head.yaml             # grouped, readable
drift diff --base <old> --head <new> --format json         # drift-diff/v1, validated with zod before printing
drift compare --base examples/petstore/v1.yaml --head examples/petstore/v2-breaking.yaml \
  --traffic examples/petstore/traffic.jsonl                # labels with evidence; exit 1 (gate failed)
drift compare --base <old> --head <new> [--traffic <file.jsonl|file.har>] [--rules <file>] [--policy <file>]
  [--format text|json] [--fail-on breaking|risky] [--seed <n>] [--as-of <YYYY-MM-DD>] [--ref-root <dir>]
```

`diff` always exits 0 when both specs are valid: it describes changes and does not gate. `compare` is the gate: exit 0 when it passes, 1 when a change at or above `--fail-on` is found, 2 for invalid specs, rules, policy or traffic files. `--as-of` sets the date suppressions are checked against (default: today, UTC); the goldens pin it. `--ref-root` widens where local `$ref`s may point (default: each spec's own directory).

`compare` reads JSONL traffic as a stream, so the file size is not limited. It hashes the file first, because the hash is the Corpus stage's cache key. A HAR file is a single JSON document and is limited to 256 MiB.

From the repository root, prefix the commands with `pnpm --filter @drift/cli exec`.

## Usage (M0 skeleton, still valid)

```bash
pnpm --filter @drift/cli exec drift --version   # "0.0.0 (engine 0.0.0)", exit 0
pnpm --filter @drift/cli exec drift --help      # exit 0
pnpm --filter @drift/cli exec drift             # help on stderr, exit 2 (no command given)
```

## Public API

- `runCli(args, io) → Promise<ExitCode>` runs the CLI and **returns** the exit code instead of calling `process.exit`, so the binary and the tests share one code path.
- `createProgram(io)` builds the commander tree. `io` injects stdout and stderr.
- `bin.ts` is the executable entry: it sets `process.exitCode` from `runCli`.

## Exit codes

`0` pass · `1` gate failed · `2` usage, config or invalid-spec error · `3` internal error. Commander's parse errors map to 2; any other thrown error maps to 3 with a one-line message.

## Implementation

- `src/commands/validate.ts`, `src/commands/diff.ts`, `src/commands/compare.ts`: thin wrappers over core (`ingestSpec`, `diffSpecs`, `compare`). The CLI only reads files, parses flags and prints; all logic is in core. Rules and policy files are parsed with core's safe YAML/JSON parser and validated with the schemas core re-exports from `@drift/rules`.
- `src/fs-reader.ts`: the file-system `SpecReader`; diagnostic paths are shown relative to the working directory.
- `src/render.ts`: text rendering of diagnostics, changes and reports (labels, rule, evidence and the first failing sample).
- Golden tests:
  - `examples/invalid/*.expected.txt`: exact `validate` output;
  - `examples/diff/*/expected.json`: exact `diff` changes;
  - `examples/petstore/expected.json`, `expected.txt`, `expected-synthetic.txt`: exact `compare` output with and without traffic.
- Usage-error tests cover invalid and incomplete rulesets, invalid policies, YAML syntax errors, bad HAR files, missing files, and bad `--seed` and `--as-of` values.

## Questions an examiner might ask

- **Why does `drift diff` not fail when it finds RISKY changes?** Diff is structural only. Failing needs evidence and a policy (`--fail-on`), which is the job of `compare`.
- **Why does `compare` need `--as-of` in tests?** Suppressions expire, so the result depends on the date. Passing the date in keeps the engine pure and the goldens reproducible.

- **Why return the exit code instead of exiting?** Calling `process.exit` inside logic kills the test runner and can truncate buffered output. Setting `process.exitCode` lets Node flush stdout first.
- **How is the binary itself tested?** `bin.test.ts` spawns `node src/bin.ts` (Node's type stripping runs TypeScript directly) and checks the real exit codes.
