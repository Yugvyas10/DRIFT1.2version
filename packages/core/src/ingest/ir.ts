import type { JsonObject } from "../util/json.ts";

/**
 * The intermediate representation (IR) of one contract: what Diff compares and what the spec hash covers.
 *
 * Schemas are normalised JSON Schema objects (see normalize.ts). Every schema node carries `$source`,
 * the location it came from, and a reference to a component is kept as `{ "$ref": "<component id>" }`
 * pointing into `schemas`, so recursive schemas stay finite. The IR is plain JSON so it can be hashed
 * with `contentHash` and cached (ADR-0006).
 */
export type NormalizedSchema = JsonObject;

export type ParameterLocation = "path" | "query" | "header" | "cookie";

export interface MediaTypeIR {
  schema: NormalizedSchema | null;
  source: string;
}

export interface ParameterIR {
  name: string;
  in: ParameterLocation;
  required: boolean;
  deprecated: boolean;
  description?: string;
  schema: NormalizedSchema;
  source: string;
}

export interface RequestBodyIR {
  required: boolean;
  description?: string;
  content: Record<string, MediaTypeIR>;
  source: string;
}

export interface ResponseIR {
  description?: string;
  content: Record<string, MediaTypeIR>;
  source: string;
}

/** One way to satisfy security: every listed scheme, with at least these scopes. */
export type SecurityRequirementIR = Record<string, string[]>;

export interface OperationIR {
  /** `METHOD /path/{}/template`, with path parameter names erased: `/users/{id}` ≡ `/users/{userId}`. */
  key: string;
  method: string;
  /** The path as written in the spec. */
  path: string;
  /** The path with parameter names erased. */
  template: string;
  /** Path parameter names in template order. */
  pathParams: string[];
  source: string;
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  /** Keyed by `path:<position>`, `query:<name>`, `header:<lower-case name>` or `cookie:<name>`. */
  parameters: Record<string, ParameterIR>;
  requestBody?: RequestBodyIR;
  /** Keyed by status code, range (`2XX`) or `default`. */
  responses: Record<string, ResponseIR>;
  /** Effective alternatives (any one suffices). `[]` means no authentication; `[{}]` optional authentication. */
  security: SecurityRequirementIR[];
}

export interface SpecIR {
  irVersion: 1;
  oasVersion: string;
  info: { title: string; version: string };
  operations: Record<string, OperationIR>;
  /** Normalised component schemas reachable from operations, keyed by component id. */
  schemas: Record<string, NormalizedSchema>;
}
