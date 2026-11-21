import { stringify } from "yaml";
import { ingestSpec, type IngestedSpec } from "../ingest/ingest.ts";
import type { IngestOptions } from "../ingest/types.ts";
import { memoryReader } from "./memory-reader.ts";

/** A minimal valid OpenAPI 3.0 document with the given paths and components. */
export function openapi(paths: Record<string, unknown>, components: Record<string, unknown> = {}, version = "3.0.3") {
  return { openapi: version, info: { title: "Test", version: "1" }, paths, components };
}

/** Ingests one in-memory document (serialised as YAML) and fails loudly if it is not valid. */
export async function ingestObject(document: unknown, options: Partial<IngestOptions> = {}): Promise<IngestedSpec> {
  const reader = memoryReader({ "/spec/openapi.yaml": stringify(document) });
  const result = await ingestSpec("/spec/openapi.yaml", { reader, ...options });
  if (!result.spec) throw new Error(`Test spec is invalid: ${JSON.stringify(result.diagnostics, null, 2)}`);
  return result.spec;
}
