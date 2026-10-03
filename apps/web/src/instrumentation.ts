/**
 * Runs once when the Next.js server starts: turns tracing on when OTEL_EXPORTER_OTLP_ENDPOINT is set, so the
 * spans of API requests (src/server/api/routes.ts) are exported and the worker's spans can join their traces.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint === undefined || endpoint === "") return;
  const { startTracing } = await import("@drift/platform");
  startTracing({ service: "drift-web", endpoint });
}
