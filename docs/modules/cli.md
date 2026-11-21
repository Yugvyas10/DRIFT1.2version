# @drift/cli — the `drift` command

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M0 — skeleton. `validate` and `diff` land in M1, `compare` in M2, the full surface in M3.

## Usage (M0)

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

## Questions an examiner might ask

- **Why return the exit code instead of exiting?** Calling `process.exit` inside logic kills the test runner and can truncate buffered output. Setting `process.exitCode` lets Node flush stdout first.
- **How is the binary itself tested?** `bin.test.ts` spawns `node src/bin.ts` (Node's type stripping runs TypeScript directly) and checks the real exit codes.
