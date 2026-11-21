import { describe, expect, it } from "vitest";
import { injectTraceContext, startTracing, tracer } from "./telemetry.ts";

// In its own file: once a process has started tracing, it stays on for that process.
describe("tracing that is not configured", () => {
  it("registers nothing: spans are no-ops and no context is propagated", async () => {
    const tracing = startTracing({ service: "test" });
    expect(injectTraceContext()).toEqual({});
    tracer().startActiveSpan("ignored", (span) => {
      expect(span.isRecording()).toBe(false);
      span.end();
    });
    await tracing.shutdown();
  });
});
