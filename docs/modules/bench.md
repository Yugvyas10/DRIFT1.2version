# @drift/bench

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M3 — pinned real-world fixtures, the fixture check, the performance benchmark, the start of the labelled-mutation benchmark (DRIFT only), and the generator of `docs/EVALUATION.md`. **M8** adds more specs and mutation operators, and the comparison with oasdiff.

## Rule

Every accuracy or performance number anywhere in this repository, README included, is produced by this package:

1. The benchmarks write machine-readable results to `docs/evaluation/*.json`.
2. `docs/EVALUATION.md` is rendered from those files only.
3. CI (`evaluation:check`) fails when the committed page differs from what the committed results give. The check re-renders the page; it does not re-run the benchmarks.

## Commands

| Command (`pnpm --filter @drift/bench run …`) | What it does                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fixtures:fetch`                             | Downloads the pinned fixtures into `fixtures/.cache/` (git-ignored); refuses any file whose SHA-256 differs from the pin.                                                                                                |
| `fixtures:check`                             | Ingests every fixture and diffs it with itself (must be zero changes); writes `results/fixtures.json`.                                                                                                                   |
| `perf [--sizes 1000,10000] [--no-fixtures]`  | The performance benchmark. A complete run writes `docs/evaluation/perf.json` and the page; a partial one (other sizes, no fixtures) writes `results/perf.json` only. Exits 1 if a corpus run exceeds the memory ceiling. |
| `mutations [--fixtures]`                     | The labelled-mutation benchmark on the petstore example (and the fixtures); writes `docs/evaluation/mutations.json` and the page.                                                                                        |
| `evaluation` / `evaluation:check`            | Renders the page from the committed results / checks it (CI).                                                                                                                                                            |
| `all`                                        | Fetch, check, perf, mutations with fixtures.                                                                                                                                                                             |

The workflow **Benchmarks** (`.github/workflows/benchmarks.yml`) runs `all` on a GitHub-hosted runner and uploads the results as an artifact. It starts by hand once it is on `master`, or when a pull request gets the label `run-benchmarks` (it then measures the branch's head commit).

## Performance benchmark (`src/perf.ts`)

- **Recorded traffic of growing size:** 1,000 to 1,000,000 lines.
  - Traffic is generated from the old contract with DRIFT's own request generator, so it is valid and varied for any spec, and written to a temporary file before timing starts.
  - `drift compare` then streams the file (petstore v1 → v2-breaking) while memory is sampled every 25 ms.
  - Reported per size: time, lines per second, kept samples, peak RSS, and whether peak RSS stayed under the **memory ceiling fixed here: 512 MiB**.
  - The page also states how the time per line changes from the smallest to the largest run, i.e. whether scaling is linear.
- **Cached re-run:** the same comparison twice with a stage cache.
- **Real-world specs:** for each fixture, ingest time, a full self-compare, and a compare against a mutant (a required request property added), with peak memory.

## Mutation benchmark (`src/mutations.ts`, `src/evaluate.ts`)

Operators change one place in a copy of a spec and carry their own label:

- **breaking:** a request enum value removed, a request bound tightened, a required request property added, an operation removed, a response enum value added;
- **safe:** an optional request property added, an operation added, a description edited, a request bound relaxed.

Sites are chosen deterministically from a seed. A component schema is only a site when **one side alone** uses it (computed by following references), because changing a component shared by requests and responses would make the label ambiguous. DRIFT compares each mutant with the original without traffic.

- Breaking mutants are counted as proven (BREAKING), flagged (RISKY) or missed.
- Safe mutants are counted as false BREAKING, over-cautious (RISKY) or correct.
- The page reports BREAKING precision and recall, and lists every mutation.

## Questions an examiner might ask

- **Why download instead of committing the specs?** Licence hygiene and repository size. Pinning by commit and SHA-256 makes the download exactly reproducible, and a tampered file is rejected.
- **How do you know EVALUATION.md was not edited by hand?** CI re-renders it from `docs/evaluation/*.json` and fails on any difference. The JSON files come from benchmark runs and record the machine, Node version, engine version and date.
- **Is 100% precision on petstore meaningful?** Only as a first check: the sample is small (the page shows the totals). M8 runs the operators on the three real-world specs and against oasdiff.
- **Why is the memory ceiling in code?** PLAN M8 requires 1M samples under a ceiling fixed in advance. Fixing it in M3, before the big runs, stops the target from being moved to fit the result.
- **Why generate traffic instead of using real traffic?** No public traffic exists for these specs. Generated traffic exercises the same code paths (parsing, routing, sampling, redaction, validation), and generation is not timed.
