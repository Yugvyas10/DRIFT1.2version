# @drift/github-action

**Owner:** P4 (Pruthvi Gangapure). Reviewer P2 (permissions). **Status:** M4 — the Action, bundled and dogfooded on DRIFT's own API contract. Usage, inputs, permissions and branch protection: [`packages/github-action/README.md`](../../packages/github-action/README.md).

## Files

| File                | Role                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action.yml`        | Inputs, outputs, `runs: node24` with `dist/index.js`.                                                                                                                                                                         |
| `src/inputs.ts`     | Reads and validates inputs (booleans are exactly `true`/`false`; enums are checked). Comment keys keep to `[A-Za-z0-9._/-]`, so a key cannot end the HTML comment it sits in.                                                 |
| `src/run.ts`        | `runAction`: chooses the base, fetches it if needed, runs `prepareCompare` (from `@drift/cli`) and `compare` (from `@drift/core`), writes the report files, the summary and the comment, uploads SARIF, and returns the gate. |
| `src/comment.ts`    | `upsertComment`: finds this step's comment by the report marker, the key marker **and** the author, then updates it or creates one.                                                                                           |
| `src/git.ts`        | `git cat-file -e` and `git fetch --depth=1 origin <sha>` through `execFile` (no shell). Base commits must be hex ids.                                                                                                         |
| `src/github.ts`     | The REST calls through `@actions/github` (Octokit): comments, `GET /user`, SARIF upload.                                                                                                                                      |
| `src/main.ts`       | Wires `@actions/core` (inputs, outputs, summary, `setFailed`) and the event payload to `runAction`.                                                                                                                           |
| `scripts/bundle.ts` | esbuild: one ES module for Node 24, with a `require` shim for CommonJS dependencies. `--check` rebuilds in memory and compares with the committed bundle (a CI step).                                                         |

Everything except `main.ts` is tested with fakes and temporary git repositories: the petstore example as base commit and working tree, pull request and push events, a shallow checkout, a new contract, refused comments and uploads, and a fake GitHub REST API behind the real Octokit client.

## Behaviour

- **Base:** the `spec` path at the pull request's base commit, or at the commit before a push. Other events need the `base` input. When the contract does not exist at the base, the step passes with a notice (`base-missing: pass`) or fails (`fail`).
- **Report size:** the comment uses `renderMarkdown(report, { maxLength })` from core, so a large report lists changes in order (BREAKING in full, then RISKY and SAFE rows) while they fit under GitHub's 65,536 characters, and says how many it left out. The job summary gets the same with a larger limit, and `report-dir` holds every file.
- **Failures that do not decide the gate:** a refused comment (forks get a read-only token) or SARIF upload is a warning; the gate still passes or fails the step.
- **`upload`:** not built until M5. It logs "not built yet … nothing was sent anywhere" and does nothing else (INVENTORY §1.3).

## Dogfooding

`apps/web/openapi/drift-api.yaml` is the design of the M5 ingestion API, written before its implementation. The CI job `dogfood` runs this Action (from the same commit, `uses: ./packages/github-action`) on it for every pull request. In M5, contract tests check the real handlers against it.

## Questions an examiner might ask

- **Does a failing Action block a merge by itself?** No. The repository must list the check as required in branch protection; the README says how.
- **Why commit a bundle?** A JavaScript Action runs `dist/index.js` directly, with no install step. CI rebuilds it and fails if the committed file differs, so it cannot drift from the source.
- **Could someone hijack the comment?** The Action only updates a comment that carries both markers **and** was written by the same identity (`github-actions[bot]` for the workflow token, or the login behind a personal token). Copying the markers into your own comment does not make the report appear under your name.
- **What about pull requests from forks?** They get a read-only token, so the comment fails with a warning and the job summary still has the report. The docs warn against `pull_request_target`, which would run fork code with a write token.
- **Why fetch the base commit instead of requiring `fetch-depth: 0`?** A full clone of a large repository is slow; one shallow fetch of the base commit is enough to read the old contract with `git cat-file`.
