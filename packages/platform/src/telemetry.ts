import { context, propagation, ROOT_CONTEXT, trace, type Context, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export interface Tracing {
  shutdown(): Promise<void>;
}

/**
 * Starts tracing for a process: spans go to an OTLP endpoint (Jaeger locally, `http://localhost:4318`) or to a
 * given exporter (tests). Without either, nothing is registered and every span call is a no-op, so tracing
 * costs nothing where it is not configured.
 */
export function startTracing(options: {
  service: string;
  endpoint?: string | undefined;
  exporter?: SpanExporter;
}): Tracing {
  if (options.endpoint === undefined && !options.exporter) return { shutdown: () => Promise.resolve() };
  const exporter =
    options.exporter ??
    new OTLPTraceExporter({ url: `${(options.endpoint ?? "").replace(/\/+$/, "")}/v1/traces`, timeoutMillis: 5000 });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.service }),
    // Tests read spans as soon as they end; a real exporter batches them.
    spanProcessors: [options.exporter ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter)],
  });
  // Registers the global tracer provider, an AsyncLocalStorage context manager and W3C trace-context propagation.
  provider.register();
  return {
    // An unreachable collector must not hold up a shutdown: spans that cannot be sent in time are dropped.
    shutdown: async () => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
      });
      await Promise.race([provider.shutdown().catch(() => undefined), timeout]);
      clearTimeout(timer);
    },
  };
}

const SHUTDOWN_TIMEOUT_MS = 2000;

export function tracer(): Tracer {
  return trace.getTracer("drift");
}

/** The current trace context as W3C headers (`traceparent`), to put in a queued job. */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** The trace context a job carries, so the worker's spans become children of the request that queued it. */
export function extractTraceContext(carrier: Readonly<Record<string, string>>): Context {
  return propagation.extract(ROOT_CONTEXT, carrier);
}

export { context, SpanStatusCode, trace } from "@opentelemetry/api";
