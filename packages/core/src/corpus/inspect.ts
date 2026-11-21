import type { SpecIR } from "../ingest/ir.ts";
import { redactSample } from "./redact.ts";
import { Router } from "./router.ts";
import { toSample, type TrafficEntry } from "./traffic.ts";

export interface TrafficInspection {
  read: number;
  malformed: number;
  malformedExamples: { line: number; reason: string }[];
  /** Records per `METHOD /template` when a spec was given, else per `METHOD /path` as sent. */
  operations: Record<string, number>;
  /** Records matching no operation (only with a spec). */
  unrouted: number;
  /** Records with at least one redacted value, and how many values would be redacted. */
  redaction: { records: number; values: number; pointers: Record<string, number> };
  statuses: Record<string, number>;
}

/**
 * `drift corpus inspect`: what DRIFT would see in a traffic file, without comparing contracts. Never returns a
 * value from the traffic; only counts, paths and pointers (redaction is applied before anything is counted).
 */
export async function inspectTraffic(
  entries: AsyncIterable<TrafficEntry> | Iterable<TrafficEntry>,
  spec?: SpecIR,
  maxMalformedExamples = 10
): Promise<TrafficInspection> {
  const router = spec ? new Router(spec) : undefined;
  const result: TrafficInspection = {
    read: 0,
    malformed: 0,
    malformedExamples: [],
    operations: {},
    unrouted: 0,
    redaction: { records: 0, values: 0, pointers: {} },
    statuses: {},
  };
  for await (const entry of entries) {
    result.read++;
    if ("malformed" in entry) {
      result.malformed++;
      if (result.malformedExamples.length < maxMalformedExamples) {
        result.malformedExamples.push({ line: entry.line, reason: entry.malformed });
      }
      continue;
    }
    const sample = toSample(entry.line, entry.record);
    const route = router?.match(sample.method, sample.path);
    let key: string;
    if (router && !route) {
      result.unrouted++;
      key = "";
    } else {
      key = route?.operation ?? `${sample.method} ${sample.path}`;
    }
    const redacted = redactSample({ ...sample, operation: key, pathParams: route?.pathParams ?? [] });
    if (key !== "" && !route) {
      // Without a spec, group by the path as sent, with any detected values in it redacted.
      key = `${sample.method} ${redacted.path}`;
    }
    if (key !== "") result.operations[key] = (result.operations[key] ?? 0) + 1;
    if (redacted.redacted.length > 0) {
      result.redaction.records++;
      result.redaction.values += redacted.redacted.length;
      for (const pointer of redacted.redacted) {
        result.redaction.pointers[pointer] = (result.redaction.pointers[pointer] ?? 0) + 1;
      }
    }
    if (sample.response) {
      const status = String(sample.response.status);
      result.statuses[status] = (result.statuses[status] ?? 0) + 1;
    }
  }
  return result;
}
