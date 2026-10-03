# @drift/platform

**Owner:** P3 (Tanishq Chavan). Reviewer P2 (security of logs and storage). **Status:** M6.

## Purpose

The infrastructure the web app and the worker share, so neither re-implements it: object storage, the Redis connection, the run queue, run events, the per-organisation semaphore, logging and tracing. It holds no engine logic (that is `@drift/core`) and no HTTP or UI code. `@drift/core` and the leaf packages may not import it (ESLint rule).

## Public API

| Module         | Exports                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage.ts`   | `createS3Store(settings)` → `ObjectStore` (`getText`, `putText`, `stream`, `presignPut`, `presignGet`, `inspect`, `ping`); `artifactKey`, `stageCacheKey`. Moved from `apps/web` in M6. |
| `redis.ts`     | `createRedis(url, { failFast? })`; `redisTarget(url)` (`host:port`, never credentials).                                                                                                 |
| `queue.ts`     | `RUN_QUEUE`, `DEAD_QUEUE`, `RunJob` (zod: `runId`, `orgId`, `trace`), `RUN_JOB_OPTIONS` (3 attempts, exponential backoff from 2 s), `createRunQueue`.                                   |
| `events.ts`    | `RunEvent` (zod union), `publishRunEvent`, `readRunEvents(redis, runId, afterId?)`, `isEventId`, `compareEventIds`, `isTerminal`, `RunEventHub`.                                        |
| `semaphore.ts` | `createSemaphore(redis, { limit, leaseMs })` → `acquire`, `release`, `held`.                                                                                                            |
| `logger.ts`    | `createLogger({ service, level })` (pino with redaction), `describeError`.                                                                                                              |
| `telemetry.ts` | `startTracing({ service, endpoint?, exporter? })`, `tracer`, `injectTraceContext`, `extractTraceContext`.                                                                               |

## Run events

Each event is appended to a Redis Stream `drift:run:<id>:events` (capped at about 500 entries) and published on `drift:run:<id>`. The stream entry id is the SSE `id:`, so `Last-Event-ID` maps to `XRANGE (<id> +`. Streams expire 7 days after the last event, or 24 hours after the final one. `RunEventHub` keeps **one** subscriber connection per process and fans messages out to listeners, so a thousand open event streams do not open a thousand Redis connections.

Events carry names, counts and timings only: never contract content, traffic or payloads.

## Key design decisions

- **Two Redis modes.** The worker's client waits for Redis during an outage (`maxRetriesPerRequest: null`, which BullMQ requires): runs pause instead of failing. The web app's client is `failFast`: a request during an outage gets an answer (503 from `/readyz`, a rate limit that fails open) instead of hanging. Both are tested against a closed port.
- **Lazy connections.** `lazyConnect` means importing a module that holds a client opens nothing, so `next build` needs no Redis.
- **Logs.** pino JSON lines with `service`, and `requestId` or `runId` added by the callers. Fields named like secrets (`authorization`, `cookie`, `password`, `token`, `apiKey`, `key`, `secret`, `accessKeyId`, `secretAccessKey`) are replaced at the top level and one level down. Errors are logged as name, message and code only, also when a library throws a plain object (its other fields could hold a command and its arguments).
- **Tracing costs nothing when off.** Without an endpoint or exporter nothing is registered and every span is a no-op. A shutdown waits at most 2 s for an unreachable collector.

## Tests

Unit: logger redaction and error description, tracing on, off and over OTLP. Integration (`pnpm --filter @drift/platform run test:integration`, Redis and S3 in containers): event order, resume after an id, expiry, the hub's fan-out and unsubscribe, the queue's job id and options, the semaphore's limit, renewal, expiry and release, the fail-fast and waiting Redis modes, and every storage operation including pre-signed URLs.

## Questions an examiner might ask

- **Why Redis Streams and pub/sub, not one of them?** Pub/sub is live but forgets; a stream remembers but needs polling. The SSE endpoint subscribes first, then replays the stream, then releases what arrived meanwhile, skipping ids it already sent: no gap and no duplicate (ADR-0004).
- **Why a semaphore instead of BullMQ's group concurrency?** Group concurrency is a BullMQ Pro feature. A sorted set of leases with Lua scripts does the same job and frees slots of dead workers by expiry.
- **Can a log line contain an API key?** Code logs ids, counts and timings only; the redaction paths are a second line of defence, tested with secrets at both levels. Worker and web logs from a full local run were checked for the key, the passwords and the S3 secret.
- **Why is storage here and not in the web app?** The worker needs the same client and key layout. Two copies would drift apart; tenant isolation depends on the key layout (`orgs/<org>/…`).
