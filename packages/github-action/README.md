# DRIFT contract gate — GitHub Action

Runs DRIFT on a pull request. It compares the pull request's OpenAPI contract with the one at the base commit and labels every change BREAKING (only with failing evidence), RISKY or SAFE. Then it:

- writes the Markdown report to the job summary;
- posts **one** pull-request comment and updates it on every push (found by a hidden marker, and only a comment by the same identity);
- optionally uploads the SARIF report to GitHub code scanning;
- fails the step when the gate fails (`fail-on: breaking`, or `risky`).

Engine logic is `@drift/core`; inputs are prepared exactly as `drift compare` prepares them. The Action is one bundled file (`dist/index.js`, Node 24), so it runs without an install step.

## Usage

```yaml
name: API contract
on:
  pull_request:
    paths: ["openapi.yaml"]

permissions:
  contents: read
  pull-requests: write # the comment; leave it out to rely on the job summary only

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Yugvyas10/DRIFT1.2version/packages/github-action@<commit-sha> # pin to a full commit SHA
        with:
          spec: openapi.yaml
          # traffic: traffic.jsonl   # recorded traffic as evidence (redacted before use)
          # fail-on: risky
```

The base is the same path at the pull request's base commit. A shallow checkout lacks that commit, so the Action fetches it (`git fetch --depth=1 origin <sha>`). In a private repository keep checkout's default `persist-credentials: true`, or use `fetch-depth: 0`.

| Input               | Default               | Meaning                                                                                      |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `spec`              |                       | The contract's path. Head: this file. Base: the same path at the base commit.                |
| `base`, `head`      |                       | Overrides: a file, or `<ref>:<path>` for the base.                                           |
| `traffic`           |                       | drift-traffic/v1 JSONL or HAR. Redacted before use.                                          |
| `rules`, `policy`   |                       | A ruleset or a policy file (escalations, expiring suppressions).                             |
| `config`            | `drift.config.*`      | A config file; inputs win over it.                                                           |
| `fail-on`           | `breaking`            | Which label fails the step.                                                                  |
| `comment`           | `true`                | One pull-request comment (needs `pull-requests: write`).                                     |
| `sarif`             | `false`               | Upload to code scanning (needs `security-events: write`).                                    |
| `upload`            | `false`               | Upload the run to the DRIFT platform. Needs `project`, `api-url` and `api-key`.              |
| `project`           |                       | The platform project (its slug).                                                             |
| `api-url`           |                       | Base URL of the platform (https).                                                            |
| `api-key`           |                       | A DRIFT API key with `runs:write`, from a repository secret: `${{ secrets.DRIFT_API_KEY }}`. |
| `base-missing`      | `pass`                | The contract is new (absent at the base): `pass` with a notice, or `fail`.                   |
| `comment-key`       | the head path         | Keeps comments of several DRIFT steps in one pull request apart.                             |
| `working-directory` | `.`                   | Where to run.                                                                                |
| `token`             | `${{ github.token }}` | For the comment and the SARIF upload.                                                        |

Outputs: `passed`, `breaking`, `risky`, `safe`, `semver`, `run-id` (with `upload`), and `report-dir` (JSON, Markdown, HTML and SARIF reports, for `actions/upload-artifact`).

## Permissions

Least privilege: `contents: read`, plus `pull-requests: write` for the comment and `security-events: write` for SARIF. Pull requests from forks get a read-only token: the comment and upload are then skipped with a warning, and the gate still decides the step. Do not switch to `pull_request_target` to get a write token: it would run with secrets on code from the fork.

## Blocking merges

A failing step does not block a merge by itself. In the repository's settings, add a branch protection rule (or ruleset) for the default branch with **Require status checks to pass before merging**, and select the job's check (for the example above, `drift`). Only then does a BREAKING change stop the merge button.
