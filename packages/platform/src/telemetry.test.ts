import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterAll, describe, expect, it } from "vitest";
import { context, extractTraceContext, injectTraceContext, startTracing, trace, tracer } from "./telemetry.ts";

describe("tracing", () => {
  const exporter = new InMemorySpanExporter();
  const tracing = startTracing({ service: "drift-test", exporter });
  afterAll(() => tracing.shutdown());

  it("carries a trace from the code that queues a job to the code that runs it", () => {
    // "web": a request span, whose context goes into the job.
    const carrier = tracer().startActiveSpan("POST /api/v1/runs/{runId}/complete", (span) => {
      const injected = injectTraceContext();
      span.end();
      return injected;
    });
    expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    // "worker": later, elsewhere, with only the job's data.
    const run = tracer().startSpan("run", {}, extractTraceContext(carrier));
    const stage = tracer().startSpan("stage diff", {}, trace.setSpan(context.active(), run));
    stage.end();
    run.end();

    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["POST /api/v1/runs/{runId}/complete", "stage diff", "run"]);
    expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(1);
    const [web, stageSpan, runSpan] = spans;
    expect(runSpan?.parentSpanContext?.spanId).toBe(web?.spanContext().spanId);
    expect(stageSpan?.parentSpanContext?.spanId).toBe(runSpan?.spanContext().spanId);
    expect(runSpan?.resource.attributes["service.name"]).toBe("drift-test");
  });

  it("starts a new trace for a job without context", () => {
    const span = tracer().startSpan("run", {}, extractTraceContext({}));
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    span.end();
  });
});
