# @drift/cli — the `drift` command

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M6 — the full local surface (M3): `validate`, `diff`, `compare` (every report format, `--out`, cache, git revisions, config file), `explain`, `rules list` and `corpus inspect`; `compare --upload` (M5); and server-side runs on the platform, `run` and `rerun` (M6).

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
  [--format console,json,html,md,sarif,junit] [--out <dir>] [--fail-on breaking|risky] [--seed <n>]
  [--as-of <YYYY-MM-DD>] [--config <file>] [--cache <dir> | --no-cache] [--ref-root <dir>]
drift compare --base origin/main:openapi.yaml --head openapi.yaml    # the old contract from git
drift explain <change-id> [--report drift-report.json | compare options] [--format text|json]
drift rules list [--rules <file>] [--format text|json]
drift corpus inspect <traffic> [--spec <openapi>] [--format text|json]
DRIFT_API_KEY=drift_… drift compare --base <old> --head <new> --upload --project <slug> \
  [--api-url <url> | DRIFT_API_URL] [--commit <sha>] [--branch <name>] [--pr <number>]   # send the run to the platform
DRIFT_API_KEY=drift_… drift run --base <old> --head <new> --project <slug> [--traffic <file>] [--policy <file>]
  [--rules <file>] [--fail-on breaking|risky] [--seed <n>] [--api-url <url>] [--commit <sha>] [--branch <name>]
  [--pr <number>] [--no-wait]                              # compare on the platform, follow it live, gate
DRIFT_API_KEY=drift_… drift rerun <run-id> [--traffic <file> | --no-traffic] [--policy <file>] [--rules <file>]
  [--fail-on breaking|risky] [--seed <n>] [--api-url <url>] [--no-wait]   # a child run; unchanged stages cached
```

`run` uploads the contracts (a file or `<ref>:<path>`, single-file contracts only) and the traffic, then follows the run's events and prints one line per stage (`computed` or `cached`, with its time) and the gate. It exits like `compare`: 0 pass, 1 gate failed, 2 bad input or a refused request (also when the platform reports `invalid_spec` or `invalid_input`), 3 when the platform failed the run. `--no-wait` prints the run id and exits 0. A dropped event stream is resumed with `Last-Event-ID` (up to 5 drops in a row).

- **Formats:** one format prints to stdout; several need `--out <dir>`, which writes `drift-report.{txt,json,html,md,sarif,junit.xml}` and still prints the console report. Colour is used only on a terminal and never with `NO_COLOR` (`FORCE_COLOR` turns it on).
- **Git revisions:** a spec argument `<ref>:<path>` that is not an existing file is read with `git cat-file` (no dependency), local `$ref`s included. The path is relative to the working directory. Refs starting with `-` are refused (no option injection), and `execFile` is used without a shell.
- **Config:** `drift.config.json` or `drift.config.yaml` in the working directory, or `--config <file>`:
  - `format: drift-config/v1` plus any of `base`, `head`, `traffic`, `rules`, `policy`, `formats`, `out`, `failOn`, `seed`, `refRoot`, `cache` (a directory, or `false`);
  - paths are relative to the config file, and flags win;
  - JSON Schema: `packages/cli/schemas/drift-config-v1.schema.json`.
- **Cache:** stage outputs go to `.drift/cache/` (git-ignored) by default. A re-run with unchanged inputs prints `cache  reused diff, corpus, verify, classify`. Entries are keyed by content hash, so they never go stale, but the key includes the engine _version_: when changing engine code locally without bumping it, use `--no-cache`.
- `explain` accepts a unique id prefix (4+ characters). It shows the rule, the rationale, evidence counts, confidence and every failing sample with its redacted pointers.
- `corpus inspect` prints counts, routing and which pointers would be redacted, never a value from the traffic.

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

| Code | Meaning                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | The gate passed (`compare`), or the command succeeded.                                                                                        |
| 1    | The gate failed: a change at or above `--fail-on` that is not suppressed.                                                                     |
| 2    | Usage error: bad flags, an invalid spec, rules, policy, config, traffic or report file, a missing file, an unknown git revision or change id. |
| 3    | Internal error: a bug, or (`run`, `rerun`) the platform failed the run. One line on stderr.                                                   |

Commander's parse errors map to 2. The tests cover every code.

## Implementation

- `src/commands/validate.ts`, `src/commands/diff.ts`, `src/commands/compare.ts`: thin wrappers over core (`ingestSpec`, `diffSpecs`, `compare`). The CLI only reads files, parses flags and prints; all logic is in core. Rules and policy files are parsed with core's safe YAML/JSON parser and validated with the schemas core re-exports from `@drift/rules`.
- `src/inputs.ts`: loading specs (file or git), traffic, rules and policy, with every failure as a usage error.
- `src/git.ts`: git revisions as specs. `src/config.ts`: `drift.config`. `src/cache.ts`: the file-system stage cache, with atomic writes (temporary file, then rename).
- `src/commands/explain.ts`, `rules.ts`, `corpus.ts`: the M3 commands.
- `src/upload.ts`: `--upload`. `POST /api/v1/runs`, a PUT of each report file (JSON, Markdown, HTML, SARIF) to its pre-signed URL, then `…/complete`.
  - The API key comes from `DRIFT_API_KEY` only (a flag would put it in shell history and process lists) and is never printed.
  - It is sent over HTTPS only (plain HTTP is allowed for `localhost`), requests to the API never follow redirects, and it is not sent to the storage URLs.
  - The `Idempotency-Key` is the hash of the request, so a re-run of the same job returns the same run.
  - The commit is `--commit`, `GITHUB_SHA`, or `git rev-parse HEAD`. A failed upload prints the reason and exits 2; the report above it stands.
- `src/server-run.ts`: `startServerRun`, `startRerun` and `followRun` (the SSE client: frames, `Last-Event-ID`, reconnects, a deadline). Same rules for the key as `--upload`: HTTPS only (except localhost), no redirects, never sent to storage URLs. `src/commands/run.ts`: `run` and `rerun`.
- `src/index.ts` also exports `prepareCompare`, `UsageError` and `uploadReport`, so the GitHub Action prepares its inputs exactly as `drift compare` does (flags, then `drift.config`, then defaults).
- `src/fs-reader.ts`: the file-system `SpecReader`; diagnostic paths are shown relative to the working directory.
- `src/render.ts`: text rendering of diagnostics, changes and reports (labels, rule, evidence and the first failing sample).
- Golden tests:
  - `examples/invalid/*.expected.txt`: exact `validate` output;
  - `examples/diff/*/expected.json`: exact `diff` changes;
  - `examples/petstore/expected.{json,txt,md,html,sarif,junit.xml}`: exact `compare` output in every format (the M3 acceptance run with `--out`), plus `expected-synthetic.txt` (no traffic), `expected-explain.txt` and `expected-inspect.txt`.
- `surface.test.ts` covers:
  - config files (JSON, YAML, invalid, precedence);
  - git revisions, in a temporary repository: missing files, unknown refs, and a ref that tries to look like an option;
  - cache hits, colour, `explain`, `rules list` and `corpus inspect` (which must not print any planted secret).
- Usage-error tests cover invalid and incomplete rulesets, invalid policies, YAML syntax errors, bad HAR files, missing files, and bad `--seed` and `--as-of` values.

## Questions an examiner might ask

- **Why have both `compare --upload` and `run`?** `compare --upload` compares on the CI machine and stores the result; nothing leaves the runner but the report. `run` sends the contracts and traffic to the platform, which runs the engine in its worker, caches stage outputs per organisation and lets anyone re-run a stage later (`rerun`) without the original machine.
- **What if the connection drops while `run` follows a run?** It reconnects with the last event id it saw, and the server sends only what came after, so no stage line is lost or printed twice (tested with a fake platform that drops the stream).

- **Why read git revisions with `git cat-file` instead of a library?** Git is already on every CI runner. `execFile` with an argument array means no shell, and refs starting with `-` are refused, so nothing in a ref can become an option. Local `$ref`s in the old revision are read from the same revision, confined to the repository.
- **Why must several formats use `--out`?** Mixing HTML, SARIF and a console report on one stdout would be unusable. With `--out`, each format is its own file and the console summary still goes to the log.

- **Why does `drift diff` not fail when it finds RISKY changes?** Diff is structural only. Failing needs evidence and a policy (`--fail-on`), which is the job of `compare`.
- **Why does `compare` need `--as-of` in tests?** Suppressions expire, so the result depends on the date. Passing the date in keeps the engine pure and the goldens reproducible.

- **Why return the exit code instead of exiting?** Calling `process.exit` inside logic kills the test runner and can truncate buffered output. Setting `process.exitCode` lets Node flush stdout first.
- **How is the binary itself tested?** `bin.test.ts` spawns `node src/bin.ts` (Node's type stripping runs TypeScript directly) and checks the real exit codes.
