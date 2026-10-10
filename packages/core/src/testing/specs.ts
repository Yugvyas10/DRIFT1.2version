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

/**
 * `operations` operations whose responses all use one component, before and after a value is added to one of its
 * response enums: the shape of a change to a widely shared schema, in miniature. As with Stripe's `account`, the
 * component sits behind an "expandable" field (`anyOf: [id string, object]`), so a sample that takes the first
 * variant everywhere never reaches it.
 */
export function sharedComponentPair(operations: number): { base: unknown; head: unknown } {
  const document = (kinds: string[]) => {
    const paths: Record<string, unknown> = {};
    for (let index = 0; index < operations; index++) {
      paths[`/r${String(index)}`] = {
        get: {
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Charge" } } },
            },
          },
        },
      };
    }
    const account = {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: kinds },
        // Twelve variants, so a full sweep would run eleven extra rounds per response.
        size: { type: "string", enum: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"] },
        note: { type: "string" },
      },
    };
    const charge = {
      type: "object",
      required: ["id", "account"],
      properties: {
        id: { type: "string" },
        account: { anyOf: [{ type: "string" }, { $ref: "#/components/schemas/Account" }] },
      },
    };
    return openapi(paths, { schemas: { Charge: charge, Account: account } });
  };
  return { base: document(["a", "b"]), head: document(["a", "b", "c"]) };
}
