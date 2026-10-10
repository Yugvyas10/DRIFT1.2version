import { describe, expect, it } from "vitest";
import { startTracing, tracer } from "./telemetry.ts";

// In its own file: this registers the real OTLP exporter for the process.
describe("tracing to an OTLP endpoint", () => {
  it("records spans and shuts down cleanly even when nothing is listening there", async () => {
    // Port 9 (discard) on this machine: nothing listens, as when Jaeger is not running.
    const tracing = startTracing({ service: "drift-test", endpoint: "http://127.0.0.1:9/" });
    tracer().startActiveSpan("work", (span) => {
      expect(span.isRecording()).toBe(true);
      span.end();
    });
    await expect(tracing.shutdown()).resolves.toBeUndefined();
  });
});
