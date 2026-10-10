# @drift/worker

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M6. The worker consumes the run queue and runs the engine for server-side runs and re-runs.

## Purpose

`drift run`, `drift rerun`, the API (`POST /api/v1/projects/{project}/runs`, `POST /api/v1/runs/{id}/rerun`) and the run page queue **server-side runs**: the platform, not the client, compares the contracts. The worker takes each queued run, runs Ingest → Diff → Corpus → Verify → Classify with `@drift/core`, and stores the report exactly as an uploaded run's. Progress goes out as run events (Redis Stream and pub/sub), which the SSE endpoint streams to browsers and the CLI.

The engine logic is `@drift/core` only. This package moves bytes between object storage, the database and the engine, and reports progress.

## Files

| File                      | Role                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`             | The process: real database, Redis, S3, logger, tracing and queue worker; stops on SIGTERM/SIGINT.                                                                                                      |
| `src/worker.ts`           | `runWorker(argv, env, deps)`: validates the environment, probes the database, Redis and storage (5 s each), then `--check` exits, or the queue is consumed until a stop signal. Returns the exit code. |
| `src/env.ts`              | The environment (zod). Empty values count as unset. Errors name variables, never values.                                                                                                               |
| `src/queue-worker.ts`     | `createRunWorker`: the BullMQ worker, the piscina pool, the per-organisation semaphore and the dead-letter queue. `deadLetter` settles runs the queue gave up on.                                      |
| `src/processor.ts`        | `processRun`: one run, from the job to the stored result. Retry and failure policy.                                                                                                                    |
| `src/engine-task.ts`      | The piscina task (a worker thread): reads inputs from storage, ingests (cached by file hash), streams traffic, calls `compare` with the organisation's stage cache, posts stage messages.              |
| `src/duration.ts`         | Time limits as people read them ("10 min").                                                                                                                                                            |
| `test/fixtures.ts`        | Integration helpers: clients for the containers, an organisation and project, a queued run with its inputs in storage, waiting for events.                                                             |
| `test/crashing-worker.ts` | A worker process that takes a run and never finishes it; the crash test kills it with SIGKILL.                                                                                                         |

## Data flow of one run

1. The web API creates the run (`QUEUED`, or `UPLOADING` until the client's PUTs and `complete`), stores the inputs as artifacts `input-base`, `input-head`, `input-traffic` under `orgs/<org>/sha256/<hash>`, and queues a job `{runId, orgId, trace}`. The job id is the run id, so a run is queued once.
2. The worker takes a slot of the organisation's semaphore (`ORG_CONCURRENCY`, default 2, across all workers). If none is free the job goes back to the delayed set for `busyDelayMs` without using an attempt.
3. The run becomes `RUNNING`, `attempts + 1`; stage rows a dead worker left `RUNNING` are marked `FAILED`.
4. The engine runs in a piscina thread. Each stage start and finish arrives over a `MessageChannel` and becomes a `StageExecution` row, a run event and an OpenTelemetry span (child of the `run` span, which is a child of the web request's span through the trace context in the job).
5. The report's four renderings go to storage; the run row, `Change` and `Evidence` rows come from the report, in one transaction that replaces anything an earlier attempt wrote.
6. `run.completed` is published; the slot is released.

## Failure policy

| Failure                                                          | Category        | Retried?                                                                         | Run ends as                          |
| ---------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| A contract is not valid OpenAPI                                  | `invalid_spec`  | No                                                                               | `FAILED`, message shown              |
| An input is missing, a HAR is not JSON, options or rules invalid | `invalid_input` | No                                                                               | `FAILED`                             |
| The run exceeds `RUN_TIMEOUT_MS` (default 10 min)                | `timeout`       | No: the thread is ended (AbortSignal)                                            | `FAILED`                             |
| The job names no run                                             | `invalid_job`   | No                                                                               | dead-letter queue only               |
| Anything else (storage, database, a bug)                         | `internal`      | Yes: 3 attempts, 2 s then 4 s backoff                                            | `FAILED` after the last              |
| The worker process dies                                          | —               | Yes: the job's lock expires (30 s) and another worker takes it; at most 2 stalls | `FAILED` via `deadLetter` after that |

Only `PermanentFailure` messages reach users; an internal error is shown as "The run failed unexpectedly." and its details go to the log. Every final failure is copied to `drift-runs-dead` with the reason.

## Run it

```bash
docker compose -f infra/docker-compose.yml up -d --wait
cp apps/worker/.env.example apps/worker/.env
pnpm turbo run build --filter=@drift/worker
pnpm --filter @drift/worker run check   # probes the database, Redis and storage, exits 0 or 1
pnpm --filter @drift/worker start       # consumes the queue until Ctrl-C (finishes runs in progress)
```

Traces: `docker compose -f infra/docker-compose.yml --profile tracing up -d --wait`, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` for the web app and the worker, and open http://localhost:16686.

## Tests

- Unit (`pnpm --filter @drift/worker test`): environment, startup, `--check`, graceful stop, unreachable dependencies (no credentials in logs).
- Integration (`pnpm --filter @drift/worker run test:integration`, Postgres, Redis and S3 in containers): a run in the real thread pool (rows, events, report, changes, redaction, slot released); a re-run with a new corpus (Ingest and Diff cache hits) and with the same inputs (all six); the cache is per organisation; a re-run with new rules and a stored suppression (everything before Classify cached); invalid contract, timeout, transient failure retried, last attempt, bad job (all to the dead-letter queue as expected); per-organisation limit without blocking other organisations; duplicate deliveries; **a worker process killed with SIGKILL mid-run, then recovered by another worker**; **one trace from the web request through the run to all six stages**; the engine task's HAR, missing-file and damaged-cache paths, and that it gives exactly `drift compare`'s result on the petstore example.

## Key design decisions

- **The engine runs in a thread (piscina).** Comparing is CPU-bound. In the main thread it would block the timers that renew the job lock and the semaphore lease, and a slow run would look dead. A thread can also be ended when the time limit passes.
- **Per-organisation concurrency is a Redis semaphore**, not BullMQ groups (a paid feature, PLAN R9). Leases expire, so a dead worker's slot frees itself; Lua scripts make acquire and release atomic.
- **Ingest is cached by the uploaded file's SHA-256** (`snapshotSpec`/`reviveSpec` in core), so a re-run parses nothing. The cache lives in object storage under `orgs/<org>/stages/`: per organisation, because a shared cache would tell one tenant that another compared the same contract.
- **Stage messages end with an explicit `end` message.** Closing a `MessagePort` can drop messages still in flight (seen in testing: the last stage was lost), so the receiver closes the channel after `end`, or after 1 s if the thread was stopped.
- **Stored suppressions and the project policy apply at run time.** The policy is the run's own (from `drift run --policy` or a re-run), else the project's stored policy (M7: set in the project settings), else the default; the project's suppressions are added to it when the worker starts the run, so accepting a change or changing the policy and re-running takes effect. The report's policy hash covers both.

## Known limitations

- Server-side runs take **single-file contracts**: a contract with `$ref`s to other files is reported as `invalid_spec`. The CLI's local `drift compare` handles multi-file contracts.
- Engine-thread code is not counted by the integration coverage when it runs in the pool; the same code is covered by in-thread runs (`engine: runEngine`).

## Questions an examiner might ask

- **What happens if the worker is killed in the middle of a run?** Its job lock (30 s) is no longer renewed. BullMQ's stalled-job check in any live worker moves the job back to the queue, and the next worker runs it as attempt 2: stage rows of attempt 1 are marked failed, results are replaced, not duplicated. `crash.int.test.ts` does exactly this with SIGKILL.
- **How do you stop one organisation from using every worker?** A Redis semaphore per organisation. A run that finds no slot is delayed, not failed, and does not use an attempt; other organisations' runs go ahead (tested).
- **Why can't a retry produce duplicate changes?** Results are written in one transaction that first deletes the run's change and report rows; stage rows are keyed by attempt.
- **How is a timeout enforced on CPU-bound code?** An `AbortSignal.timeout` is passed to piscina, which ends the thread. The run is failed as `timeout` and not retried: it would time out again.
- **Why are internal error messages hidden?** They can contain paths, hostnames or data. Users get the category and a fixed sentence; the log has the details, with secrets redacted by the logger.
- **How does a trace get from the web app to the worker?** The web request's W3C trace context is put in the job (`injectTraceContext`); the worker starts its `run` span from it (`extractTraceContext`), and each stage span is a child of `run`. In Jaeger this is one trace: `POST /api/v1/runs/{runId}/complete` → `run` → six `stage …` spans.
