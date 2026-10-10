import { TrafficRecord, type WireValue } from "@drift/report-schema";
import { getOwn, isJsonObject, type JsonValue } from "../util/json.ts";
import { mediaTypeOf, type Sample } from "./sample.ts";

/** One input record, or the reason it could not be used. Reasons never quote the input (it may hold secrets). */
export type TrafficEntry = { line: number; record: TrafficRecord } | { line: number; malformed: string };

/** Longest line accepted; longer lines are reported as malformed without being parsed. */
export const MAX_LINE_LENGTH = 4 * 1024 * 1024;

/**
 * Reads `drift-traffic/v1` JSONL one line at a time (PLAN §4.3). Memory stays bounded by one line;
 * malformed lines are reported and skipped, never fatal. Blank lines are ignored.
 */
export async function* readJsonl(lines: AsyncIterable<string>): AsyncGenerator<TrafficEntry> {
  let line = 0;
  for await (const text of lines) {
    line++;
    if (text.trim() === "") continue;
    if (text.length > MAX_LINE_LENGTH) {
      yield { line, malformed: `longer than ${String(MAX_LINE_LENGTH)} characters` };
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      yield { line, malformed: "not valid JSON" };
      continue;
    }
    yield parseRecord(line, value);
  }
}

function parseRecord(line: number, value: unknown): TrafficEntry {
  const result = TrafficRecord.safeParse(value);
  return result.success ? { line, record: result.data } : { line, malformed: describeIssues(result.error.issues) };
}

/** A safe summary of validation issues: field paths and problem kinds only, never the offending values. */
function describeIssues(issues: readonly { path: readonly PropertyKey[]; code: string; message: string }[]): string {
  const [first] = issues;
  if (!first) return "not a traffic record";
  const where = first.path.length === 0 ? "record" : first.path.map(String).join(".");
  const what = first.code === "unrecognized_keys" ? "unknown field" : first.message;
  const more = issues.length > 1 ? ` (and ${String(issues.length - 1)} more)` : "";
  return `${where}: ${what}${more}`;
}

/**
 * Imports a HAR 1.2 document (a browser or proxy capture). Each entry becomes a traffic record; entries that do
 * not fit are reported by their 1-based position. Base64-encoded (binary) bodies are skipped.
 */
export function readHar(document: unknown): TrafficEntry[] {
  const root = document as JsonValue; // the result of JSON.parse
  const log = isJsonObject(root) ? getOwn(root, "log") : undefined;
  const entries = log !== undefined && isJsonObject(log) ? getOwn(log, "entries") : undefined;
  if (!Array.isArray(entries)) return [{ line: 1, malformed: "not a HAR document (no log.entries)" }];
  return entries.map((entry, index) => {
    const converted = harEntry(entry);
    return converted === undefined
      ? { line: index + 1, malformed: "HAR entry without a request method and URL" }
      : parseRecord(index + 1, converted);
  });
}

function harEntry(entry: JsonValue): Record<string, unknown> | undefined {
  if (!isJsonObject(entry)) return undefined;
  const request = getOwn(entry, "request");
  if (!isJsonObject(request)) return undefined;
  const method = getOwn(request, "method");
  const url = getOwn(request, "url");
  if (typeof method !== "string" || typeof url !== "string" || !URL.canParse(url)) return undefined;
  const parsed = new URL(url);
  const record: Record<string, unknown> = { method, path: `${parsed.pathname}${parsed.search}` };
  const headers = harHeaders(getOwn(request, "headers"));
  if (Object.keys(headers).length > 0) record.headers = headers;
  const postData = getOwn(request, "postData");
  if (isJsonObject(postData)) {
    const body = harBody(getOwn(postData, "text"), getOwn(postData, "mimeType"), undefined);
    if (body !== undefined) record.requestBody = body;
  }
  const response = getOwn(entry, "response");
  const status = isJsonObject(response) ? getOwn(response, "status") : undefined;
  if (isJsonObject(response) && typeof status === "number" && status >= 100 && status <= 599) {
    record.status = status;
    const responseHeaders = harHeaders(getOwn(response, "headers"));
    if (Object.keys(responseHeaders).length > 0) record.responseHeaders = responseHeaders;
    const content = getOwn(response, "content");
    if (isJsonObject(content)) {
      const body = harBody(getOwn(content, "text"), getOwn(content, "mimeType"), getOwn(content, "encoding"));
      if (body !== undefined) record.responseBody = body;
    }
  }
  const started = getOwn(entry, "startedDateTime");
  if (typeof started === "string") record.timestamp = started;
  return record;
}

function harHeaders(list: JsonValue | undefined): Record<string, WireValue> {
  const headers: Record<string, string[]> = {};
  for (const header of Array.isArray(list) ? list : []) {
    if (!isJsonObject(header)) continue;
    const name = getOwn(header, "name");
    const value = getOwn(header, "value");
    // HTTP/2 pseudo-headers (":authority") are not headers of the request.
    if (typeof name !== "string" || typeof value !== "string" || name.startsWith(":")) continue;
    (headers[name.toLowerCase()] ??= []).push(value);
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, values]) => [name, values.length === 1 ? (values[0] ?? "") : values])
  );
}

function harBody(text: JsonValue | undefined, mimeType: JsonValue | undefined, encoding: JsonValue | undefined) {
  if (typeof text !== "string" || text === "" || encoding === "base64") return undefined;
  const mediaType = mediaTypeOf(typeof mimeType === "string" ? mimeType : undefined);
  if (mediaType !== undefined && (mediaType === "application/json" || mediaType.endsWith("+json"))) {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}

function wireValues(values: Record<string, WireValue> | undefined, lowerCase: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    const key = lowerCase ? name.toLowerCase() : name;
    (out[key] ??= []).push(...(Array.isArray(value) ? value : [value]));
  }
  return out;
}

function bodyOf(value: JsonValue | undefined, headers: Record<string, string[]>) {
  if (value === undefined) return undefined;
  const declared = mediaTypeOf(headers["content-type"]?.[0]);
  const contentType = declared ?? (typeof value === "string" ? "text/plain" : "application/json");
  return { contentType, value };
}

/** Turns a validated record into a sample (not yet redacted). */
export function toSample(line: number, record: TrafficRecord): Sample {
  const [rawPath, rawQuery] = splitOnce(record.path, "?");
  const query = wireValues(record.query, false);
  for (const [name, value] of new URLSearchParams(rawQuery)) (query[name] ??= []).push(value);
  const headers = wireValues(record.headers, true);
  const sample: Sample = {
    id: `r:${String(line)}`,
    origin: "recorded",
    line,
    method: record.method.toUpperCase(),
    path: rawPath,
    query,
    headers,
    redacted: [],
  };
  const body = bodyOf(record.requestBody, headers);
  if (body) sample.body = body;
  if (record.status !== undefined) {
    const responseHeaders = wireValues(record.responseHeaders, true);
    const responseBody = bodyOf(record.responseBody, responseHeaders);
    sample.response = {
      status: record.status,
      headers: responseHeaders,
      ...(responseBody ? { body: responseBody } : {}),
    };
  }
  return sample;
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  return index === -1 ? [text, ""] : [text.slice(0, index), text.slice(index + 1)];
}
