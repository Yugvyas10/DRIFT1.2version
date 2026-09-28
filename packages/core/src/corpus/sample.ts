import type { SampleOrigin } from "@drift/report-schema";
import type { JsonObject, JsonValue } from "../util/json.ts";

/** A request or response body: its media type (lower case, without parameters) and its value. */
export interface Body {
  contentType: string;
  value: JsonValue;
}

/**
 * One exchange as the engine sees it, after redaction. Recorded samples come from traffic; synthetic ones are
 * generated from a contract and are always labelled `synthetic`.
 *
 * Every part of a sample is addressed with a JSON pointer in one namespace, used both for validation errors
 * and for redacted values: `/path/<index>` (path parameter), `/query/<name>`, `/headers/<lower-case name>`,
 * `/cookies/<name>`, `/body/...`, and for responses `/response/body/...`.
 */
export interface Sample {
  id: string;
  origin: SampleOrigin;
  /** Line (JSONL) or entry number (HAR), for recorded samples. */
  line?: number;
  method: string;
  /** The request path as sent, without the query string. */
  path: string;
  query: Record<string, string[]>;
  /** Lower-case names. */
  headers: Record<string, string[]>;
  body?: Body;
  response?: { status: number; headers: Record<string, string[]>; body?: Body };
  /** JSON pointers (see above) whose values were redacted, sorted. */
  redacted: string[];
}

/** A sample routed to an operation of the old contract. */
export interface RoutedSample extends Sample {
  operation: string;
  /** Raw path parameter values by position. */
  pathParams: string[];
}

/** Media type without parameters, lower case: `Application/JSON; charset=utf-8` → `application/json`. */
export function mediaTypeOf(contentType: string | undefined): string | undefined {
  if (contentType === undefined) return undefined;
  const bare = contentType.split(";")[0]?.trim().toLowerCase();
  return bare === undefined || bare === "" ? undefined : bare;
}

export function isJsonMediaType(mediaType: string): boolean {
  return mediaType === "application/json" || mediaType.endsWith("+json") || mediaType === "*/*";
}

function wire(values: Record<string, string[]>): JsonObject {
  return Object.fromEntries(
    Object.entries(values).map(([name, list]) => [name, list.length === 1 ? (list[0] ?? "") : list])
  );
}

/** The request part of a sample as shown in reports (already redacted). */
export function requestPayload(sample: Sample): JsonObject {
  const payload: JsonObject = { method: sample.method, path: sample.path };
  if (Object.keys(sample.query).length > 0) payload.query = wire(sample.query);
  if (Object.keys(sample.headers).length > 0) payload.headers = wire(sample.headers);
  if (sample.body) payload.body = sample.body.value;
  return payload;
}

/** The response part of a sample as shown in reports (already redacted). */
export function responsePayload(sample: Sample): JsonObject {
  const response = sample.response;
  const payload: JsonObject = { method: sample.method, path: sample.path };
  if (!response) return payload;
  payload.status = response.status;
  if (response.body) {
    payload.contentType = response.body.contentType;
    payload.body = response.body.value;
  }
  return payload;
}
