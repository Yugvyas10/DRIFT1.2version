# @drift/github-action

GitHub Action that runs the DRIFT CLI in a pull request.

**Status: not implemented yet — arrives in M4.** This directory only reserves the package's place. It has no `package.json` and no code yet, so it is not a workspace project; the package is created in the milestone that implements it.

Runs `drift compare` in CI, writes the job summary, upserts one PR comment, optionally uploads SARIF, and fails the job per `fail-on`. See PLAN §6 M4.

Owner: P4 — Pruthvi Gangapure. Module documentation: [`docs/modules/github-action.md`](../../docs/modules/github-action.md).
