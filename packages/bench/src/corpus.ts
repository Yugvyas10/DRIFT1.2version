import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { FAIL, RecordingPlan, synthesizeRequest, type SpecIR } from "@drift/core";

/**
 * Writes `count` drift-traffic/v1 lines for a contract, for the corpus benchmark. Requests come from DRIFT's own
 * generator (every operation in turn, with a different plan per line), so the traffic is valid and varied for any
 * spec. Writing happens before measurement starts, so generation cost is not part of the measured time.
 */
export async function writeCorpus(
  spec: SpecIR,
  count: number,
  path: string
): Promise<{ lines: number; bytes: number }> {
  const operations = Object.values(spec.operations).sort((a, b) => (a.key < b.key ? -1 : 1));
  const out = createWriteStream(path);
  let bytes = 0;
  let written = 0;
  // Each operation cycles through its own plans; failures (e.g. unserialisable parameters) are skipped.
  const usable = operations.filter(
    (operation) => synthesizeRequest(spec, operation, new RecordingPlan(() => 0), "x") !== FAIL
  );
  for (let index = 0; written < count && usable.length > 0; index++) {
    const operation = usable[index % usable.length];
    if (!operation) break;
    const round = Math.floor(index / usable.length);
    const sample = synthesizeRequest(
      spec,
      operation,
      new RecordingPlan((_, choices) => round % choices),
      `s:${String(index)}`
    );
    if (sample === FAIL) continue;
    const query = new URLSearchParams();
    for (const [name, values] of Object.entries(sample.query)) for (const value of values) query.append(name, value);
    const search = query.toString();
    const record: Record<string, unknown> = {
      method: sample.method,
      path: search === "" ? sample.path : `${sample.path}?${search}`,
    };
    if (Object.keys(sample.headers).length > 0) record.headers = sample.headers;
    if (sample.body) record.requestBody = sample.body.value;
    const line = `${JSON.stringify(record)}\n`;
    bytes += Buffer.byteLength(line);
    written++;
    if (!out.write(line)) await once(out, "drain");
  }
  out.end();
  await once(out, "finish");
  return { lines: written, bytes };
}
