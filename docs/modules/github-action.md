# @drift/github-action

**Owner:** P4 (Pruthvi Gangapure). Reviewer P2. **Status:** reserved; implemented in **M4**.

## Planned

- A JavaScript Action bundled into a single file with esbuild. It runs `drift compare`.
- Writes the Markdown report to `$GITHUB_STEP_SUMMARY`, upserts one PR comment (found by a hidden marker), optionally uploads SARIF and uploads to the platform (M5), and fails the job per `fail-on`.
- Documents least-privilege `permissions:` and the branch-protection "required status check" needed to actually block merges.

## Questions an examiner might ask

- **Does a failing Action block a merge by itself?** No. The repository must list the check as required in branch protection. The Action's docs will say so explicitly.
