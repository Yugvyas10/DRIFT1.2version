# @drift/worker

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M0 — startup checks only. Queue processing lands in **M6**.

## What exists (M0)

`runWorker(env, deps)`:

1. validates the environment (`REDIS_URL` must be `redis://` or `rediss://`; `LOG_LEVEL` defaults to `info`);
2. pings Redis;
3. logs `redis reachable` as structured JSON (pino);
4. logs that **no job processors are registered yet**, and exits 0.

On failure it logs the real cause (e.g. `ECONNREFUSED`) and exits 1. Logs contain `host:port` only, never the URL, which may carry a password.

## Run it

```bash
docker compose -f infra/docker-compose.yml up -d --wait
cp apps/worker/.env.example apps/worker/.env
pnpm --filter @drift/worker dev
```

## Key design decisions

- **Dependencies are injected** (Redis factory, logger, stderr), so every branch is unit-tested without Redis. CI's services job runs the real binary against real Redis.
- **Exit instead of idling:** a worker that runs forever with nothing to do would look like it works. It says what it does and stops.

## Questions an examiner might ask

- **Why does the worker exit 0 if it does nothing?** The check succeeded: config is valid and Redis is reachable. The log line states plainly that no queues exist yet.
- **Why capture the Redis error from the `error` event?** ioredis rejects `connect()` with a generic "Connection is closed." and emits the real cause as an event. The worker keeps the event's error so the log is actionable.
