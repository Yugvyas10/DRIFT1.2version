import { createRunQueue, DEAD_QUEUE, injectTraceContext, RUN_QUEUE, startTracing, tracer } from "@drift/platform";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Queue } from "bullmq";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  closeServices,
  petstore,
  queuedRun,
  seedOrg,
  services,
  settled,
  waitForEvent,
  type Services,
} from "../test/fixtures.ts";
import { createRunWorker } from "./queue-worker.ts";

let s: Services;
const exporter = new InMemorySpanExporter();
const tracing = startTracing({ service: "drift-worker", exporter });

beforeAll(async () => {
  s = services();
  for (const name of [RUN_QUEUE, DEAD_QUEUE]) {
    const queue = new Queue(name, { connection: s.redis });
    await queue.obliterate({ force: true });
    await queue.close();
  }
});

afterAll(async () => {
  await tracing.shutdown();
  await closeServices(s);
});

it("puts the worker's run and its six stages in the trace of the request that queued the run", async () => {
  const files = await petstore();
  const { orgId, projectId } = await seedOrg(s.db);
  const runId = await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 });
  const queue = createRunQueue(s.redis);
  // What the web API does: queue the run inside the request's span (apps/web/src/server/api/handlers.ts, `start`).
  await tracer().startActiveSpan("POST /api/v1/runs/{runId}/complete", async (span) => {
    await queue.enqueue({ runId, orgId, trace: injectTraceContext() });
    span.end();
  });

  const worker = createRunWorker({ ...s, concurrency: 1, orgConcurrency: 2, runTimeoutMs: 60_000 });
  try {
    await waitForEvent(s.redis, runId, settled);
    await expect.poll(() => exporter.getFinishedSpans().some((span) => span.name === "run")).toBe(true);
  } finally {
    await worker.close();
    await queue.close();
  }

  const spans = exporter.getFinishedSpans();
  const web = spans.find((span) => span.name.startsWith("POST "));
  const run = spans.find((span) => span.name === "run");
  const stages = spans.filter((span) => span.name.startsWith("stage "));
  expect(new Set([web, run, ...stages].map((span) => span?.spanContext().traceId)).size).toBe(1);
  expect(run?.parentSpanContext?.spanId).toBe(web?.spanContext().spanId);
  expect(run?.attributes["drift.run.id"]).toBe(runId);
  expect(stages.map((span) => span.name).sort()).toEqual(
    ["stage classify", "stage corpus", "stage diff", "stage ingest.base", "stage ingest.head", "stage verify"].sort()
  );
  for (const stage of stages) {
    expect(stage.parentSpanContext?.spanId).toBe(run?.spanContext().spanId);
    expect(stage.attributes["drift.cache_hit"]).toBe(false);
  }
});
