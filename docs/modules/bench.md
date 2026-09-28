# @drift/bench

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M1 — pinned real-world fixtures and the fixture check. **M3** adds the performance harness and the DRIFT-only mutation generator; **M8** the full comparison with oasdiff.

## Rule

Every accuracy or performance number anywhere in this repository, README included, is produced by this package and written to `docs/EVALUATION.md` by a generator. CI will fail if the committed file differs from a regeneration. Until then, the repository contains no such numbers.

## M1: fixtures

- `src/fixtures.ts`: GitHub REST API description (3.0 and 3.1) and Stripe `spec3.yaml`, each with repository, **full commit SHA**, path, licence (MIT) and **SHA-256**.
- `fixtures:fetch`: downloads into `fixtures/.cache/` (git-ignored) and refuses any file whose hash differs from the pin.
- `fixtures:check`: ingests every fixture and diffs it with itself (must be zero changes). Writes `results/fixtures.json` (`drift-fixture-check/v1`, with the machine and engine version).
- CI job `fixtures` runs both, and uploads the results as an artifact.

## Questions an examiner might ask

- **Why download instead of committing the specs?** Licence hygiene and repository size. Pinning by commit and SHA-256 makes the download exactly reproducible, and a tampered or changed file is rejected.
- **Where do performance numbers come from?** Only from the results files this package writes. M3 turns them into `docs/EVALUATION.md`, and CI checks the file matches a regeneration.
