import { Queue } from "bullmq";
import { afterAll, describe, expect, inject, it } from "vitest";
import {
  compareEventIds,
  isEventId,
  isTerminal,
  publishRunEvent,
  readRunEvents,
  RunEventHub,
  type RunEvent,
  type StoredRunEvent,
} from "./events.ts";
import { createRunQueue, RUN_ATTEMPTS, RUN_QUEUE } from "./queue.ts";
import { createRedis, redisTarget } from "./redis.ts";
import { createSemaphore } from "./semaphore.ts";

const redis = createRedis(inject("redisUrl"));
afterAll(() => redis.quit());

let counter = 0;
const runId = () => `run_${(Date.now().toString(36) + String(counter++)).padStart(24, "0")}`;
const at = "2026-10-02T10:00:00.000Z";
const started: RunEvent = { type: "run.started", at, attempt: 1 };
const stage: RunEvent = { type: "stage.finished", at, attempt: 1, stage: "diff", cacheHit: true, durationMs: 3 };
const completed: RunEvent = {
  type: "run.completed",
  at,
  gate: { passed: false, failOn: "breaking" },
  summary: { breaking: 1, risky: 0, safe: 2, suppressed: 0 },
  semver: "major",
};

describe("run events", () => {
  it("are kept in order, and can be read from the start or after an id", async () => {
    const id = runId();
    const first = await publishRunEvent(redis, id, started);
    const second = await publishRunEvent(redis, id, stage);
    const third = await publishRunEvent(redis, id, completed);
    expect(isEventId(first.id)).toBe(true);
    expect(compareEventIds(first.id, second.id)).toBeLessThan(0);
    expect(await readRunEvents(redis, id)).toEqual([first, second, third]);
    // Resume: only what came after the last event the client saw.
    expect(await readRunEvents(redis, id, first.id)).toEqual([second, third]);
    expect(await readRunEvents(redis, id, third.id)).toEqual([]);
    // Something that is not an event id is ignored, not passed to Redis.
    expect(await readRunEvents(redis, id, "0); FLUSHALL")).toHaveLength(3);
    expect(await readRunEvents(redis, runId())).toEqual([]);
  });

  it("expire: a day after the run ends, a week while it is unfinished", async () => {
    const id = runId();
    await publishRunEvent(redis, id, started);
    expect(await redis.ttl(`drift:run:${id}:events`)).toBeGreaterThan(6 * 24 * 3600);
    await publishRunEvent(redis, id, completed);
    const ttl = await redis.ttl(`drift:run:${id}:events`);
    expect(ttl).toBeGreaterThan(23 * 3600);
    expect(ttl).toBeLessThanOrEqual(24 * 3600);
  });

  it("refuse an event that is not one", async () => {
    await expect(
      publishRunEvent(redis, runId(), { type: "stage.started", at, attempt: 1, stage: "deploy" } as never)
    ).rejects.toThrow();
    await expect(publishRunEvent(redis, runId(), { ...started, payload: "secret" } as never)).rejects.toThrow();
  });

  it("know which events end a run", () => {
    expect(isTerminal(completed)).toBe(true);
    expect(isTerminal({ type: "run.failed", at, category: "internal", message: "x", willRetry: false })).toBe(true);
    expect(isTerminal({ type: "run.failed", at, category: "internal", message: "x", willRetry: true })).toBe(false);
    expect(isTerminal(stage)).toBe(false);
    expect(isEventId("1700000000000-0")).toBe(true);
    for (const bad of ["", "abc", "1-", "1-2-3", "(1-0"]) expect(isEventId(bad)).toBe(false);
  });
});

describe("RunEventHub", () => {
  it("delivers live events to each run's listeners over one subscriber connection", async () => {
    const hub = new RunEventHub(redis);
    const [a, b] = [runId(), runId()];
    const seen: Record<string, StoredRunEvent[]> = { a1: [], a2: [], b: [] };
    const stopA1 = await hub.subscribe(a, (event) => seen.a1?.push(event));
    const stopA2 = await hub.subscribe(a, (event) => seen.a2?.push(event));
    const stopB = await hub.subscribe(b, (event) => seen.b?.push(event));
    expect(hub.watched).toBe(2);

    const sentA = await publishRunEvent(redis, a, started);
    const sentB = await publishRunEvent(redis, b, stage);
    await expect.poll(() => seen.b?.length).toBe(1);
    expect(seen).toEqual({ a1: [sentA], a2: [sentA], b: [sentB] });

    await stopA1();
    await publishRunEvent(redis, a, stage);
    await expect.poll(() => seen.a2?.length).toBe(2);
    expect(seen.a1).toHaveLength(1);
    await stopA2();
    await stopB();
    expect(hub.watched).toBe(0);
    await publishRunEvent(redis, a, completed); // nobody is listening; nothing breaks
    await hub.close();
  });
});

describe("semaphore", () => {
  it("gives out at most `limit` slots per name, and frees them on release", async () => {
    const semaphore = createSemaphore(redis, { limit: 2, leaseMs: 60_000 });
    const org = runId();
    expect(await semaphore.acquire(org, "job-1")).toBe(true);
    expect(await semaphore.acquire(org, "job-2")).toBe(true);
    expect(await semaphore.acquire(org, "job-3")).toBe(false);
    expect(await semaphore.acquire(org, "job-1")).toBe(true); // renewing its own slot
    expect(await semaphore.held(org)).toBe(2);
    // Another organisation has its own slots.
    expect(await semaphore.acquire(runId(), "job-3")).toBe(true);
    await semaphore.release(org, "job-1");
    expect(await semaphore.acquire(org, "job-3")).toBe(true);
  });

  it("never gives the last slot to two holders at once", async () => {
    const semaphore = createSemaphore(redis, { limit: 3, leaseMs: 60_000 });
    const org = runId();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => semaphore.acquire(org, `job-${String(i)}`)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("frees the slot of a holder that died, when its lease runs out", async () => {
    let now = 1_000_000;
    const semaphore = createSemaphore(redis, { limit: 1, leaseMs: 30_000, now: () => now });
    const org = runId();
    expect(await semaphore.acquire(org, "dead-worker")).toBe(true);
    now += 29_000;
    expect(await semaphore.acquire(org, "next")).toBe(false);
    now += 2_000; // the lease of the dead worker has run out
    expect(await semaphore.held(org)).toBe(0);
    expect(await semaphore.acquire(org, "next")).toBe(true);
  });
});

describe("run queue", () => {
  it("queues a run once, with retries and exponential backoff", async () => {
    const runs = createRunQueue(redis);
    const id = runId();
    const job = { runId: id, orgId: `org_${"0".repeat(24)}`, trace: { traceparent: "00-abc" } };
    await runs.enqueue(job);
    await runs.enqueue(job);
    const queue = new Queue(RUN_QUEUE, { connection: redis });
    const stored = await queue.getJob(id);
    expect(stored?.data).toEqual(job);
    expect(stored?.opts).toMatchObject({ attempts: RUN_ATTEMPTS, backoff: { type: "exponential", delay: 2000 } });
    expect((await queue.getJobs(["waiting"])).filter((queued) => queued.id === id)).toHaveLength(1);
    await expect(runs.enqueue({ runId: "not-a-run", orgId: job.orgId, trace: {} })).rejects.toThrow();
    await queue.close();
    await runs.close();
  });

  it("shows a Redis address without its credentials", () => {
    expect(redisTarget("redis://user:hunter2@cache.internal:6380/0")).toBe("cache.internal:6380");
    expect(redisTarget("rediss://cache.internal")).toBe("cache.internal:6379");
  });

  it("fails a command fast when Redis is down, for the web app; the worker's client waits for it instead", async () => {
    const web = createRedis("redis://127.0.0.1:9", { failFast: true });
    web.on("error", () => undefined);
    await expect(web.ping()).rejects.toThrow();
    web.disconnect();

    const worker = createRedis("redis://127.0.0.1:9");
    worker.on("error", () => undefined);
    const pending = worker.ping().then(
      () => "answered",
      () => "failed"
    );
    const outcome = await Promise.race([
      pending,
      new Promise((resolve) =>
        setTimeout(() => {
          resolve("waiting");
        }, 500)
      ),
    ]);
    expect(outcome).toBe("waiting");
    worker.disconnect();
  });
});
