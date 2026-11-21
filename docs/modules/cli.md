# @drift/cli — the `drift` command

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M1 — `validate` and `diff`. `compare` (with evidence) lands in M2, the full surface in M3.

## Usage

```bash
drift validate examples/valid/petstore-3.0.yaml            # ✔ ... valid OpenAPI 3.0.3 (3 operations, 0 warnings), exit 0
drift validate examples/invalid/bad-response.yaml          # file:line:col  error  CODE  message, exit 2
drift validate <spec> --format json [--ref-root <dir>]
drift diff --base examples/diff/enums/base.yaml --head examples/diff/enums/head.yaml             # grouped, readable
drift diff --base <old> --head <new> --format json         # drift-diff/v1, validated with zod before printing
```

`diff` always exits 0 when both specs are valid: it describes changes and does not gate. The gate is `compare` (M2/M3). `--ref-root` widens where local `$ref`s may point (default: each spec's own directory).

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

- `src/commands/validate.ts`, `src/commands/diff.ts`: thin wrappers over `ingestSpec` and `diffSpecs`. All logic is in core.
- `src/fs-reader.ts`: the file-system `SpecReader`; diagnostic paths are shown relative to the working directory.
- `src/render.ts`: text rendering of diagnostics and changes.
- Golden tests: `examples/invalid/*.expected.txt` (exact `validate` output) and `examples/diff/*/expected.json` (exact `diff` changes).

## Questions an examiner might ask

- **Why does `drift diff` not fail when it finds RISKY changes?** Diff is structural only. Failing needs evidence and a policy (`--fail-on`), which is the job of `compare` in M2.

- **Why return the exit code instead of exiting?** Calling `process.exit` inside logic kills the test runner and can truncate buffered output. Setting `process.exitCode` lets Node flush stdout first.
- **How is the binary itself tested?** `bin.test.ts` spawns `node src/bin.ts` (Node's type stripping runs TypeScript directly) and checks the real exit codes.
