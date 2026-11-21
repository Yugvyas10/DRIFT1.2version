# @drift/bench

Evaluation harness. **Every accuracy or performance number in this repository comes from this package's output** (CLAUDE.md); nothing is typed in by hand.

## M1: pinned real-world fixtures

| Fixture      | Source (pinned commit)                                                             | Licence |
| ------------ | ---------------------------------------------------------------------------------- | ------- |
| `github-3.0` | github/rest-api-description `descriptions/api.github.com/api.github.com.yaml`      | MIT     |
| `github-3.1` | github/rest-api-description `descriptions-next/api.github.com/api.github.com.yaml` | MIT     |
| `stripe-3.0` | stripe/openapi `openapi/spec3.yaml`                                                | MIT     |

Commits and SHA-256 hashes are in `src/fixtures.ts`. Files are downloaded, verified and cached in `fixtures/.cache/` (git-ignored); they are never committed.

```bash
pnpm --filter @drift/bench run fixtures:fetch   # download and verify (about 26 MB)
pnpm --filter @drift/bench run fixtures:check   # ingest each fixture and diff it with itself
```

`fixtures:check` writes `results/fixtures.json` (`drift-fixture-check/v1`): per fixture, whether it ingested, its size in operations and component schemas, its spec hash, the number of self-diff changes (must be 0), and wall-clock timings for that machine. CI runs both commands and keeps the results file as a build artifact.

## Later milestones

M3 adds the performance harness and the DRIFT-only mutation generator; M8 adds the comparison with oasdiff and generates `docs/EVALUATION.md` from these results.
