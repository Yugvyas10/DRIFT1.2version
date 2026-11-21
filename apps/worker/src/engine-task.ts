import type { MessagePort } from "node:worker_threads";
import {
  compare,
  ingestSpec,
  readHar,
  readJsonl,
  reviveSpec,
  snapshotSpec,
  stageKey,
  type IngestedSpec,
  type Policy,
  type Ruleset,
  type SpecReader,
  type StageCache,
  type TrafficInput,
} from "@drift/core";
import { createS3Store, stageCacheKey, type ObjectStore, type S3Settings } from "@drift/platform";
import type { Report, StageName } from "@drift/report-schema";

/** Largest stage output read back from the cache; a larger one is recomputed. */
const MAX_CACHED_BYTES = 256 * 1024 * 1024;
const MAX_SPEC_BYTES = 20 * 1024 * 1024;
const MAX_HAR_BYTES = 256 * 1024 * 1024;

export interface EngineTask {
  orgId: string;
  s3: S3Settings;
  base: { key: string; name: string; sha256: string };
  head: { key: string; name: string; sha256: string };
  traffic?: { key: string; name: string; sha256: string; format: "jsonl" | "har" };
  policy?: Policy;
  ruleset?: Ruleset;
  failOn?: "breaking" | "risky";
  seed?: number;
  asOf: string;
  /** Stage progress goes back to the main thread through this port, as `StageMessage`s. */
  port: MessagePort;
}

export type StageMessage =
  | { stage: StageName; status: "started" }
  | { stage: StageName; status: "finished"; cacheHit: boolean; hash: string }
  /** The last message: nothing more will follow. The receiver closes the channel after it. */
  | { status: "end" };

export type EngineResult =
  | { ok: true; report: Report }
  /** A failure that a retry cannot fix: the inputs themselves are wrong. `message` is safe to show. */
  | { ok: false; category: "invalid_spec" | "invalid_input"; message: string };

class InputError extends Error {
  readonly category: "invalid_spec" | "invalid_input";
  constructor(category: "invalid_spec" | "invalid_input", message: string) {
    super(message);
    this.category = category;
  }
}

let client: { settings: string; store: ObjectStore } | undefined;
/** One S3 client per thread, reused by the runs it executes (the settings are the same for all of them). */
function storeFor(settings: S3Settings): ObjectStore {
  const key = JSON.stringify(settings);
  if (client?.settings !== key) client = { settings: key, store: createS3Store(settings) };
  return client.store;
}

/** The stage cache of one organisation, in object storage. A failed read or write is a miss, never an error. */
function storageCache(store: ObjectStore, orgId: string): StageCache {
  return {
    get: (hash) => store.getText(stageCacheKey(orgId, hash), MAX_CACHED_BYTES).catch(() => undefined),
    put: (hash, value) => store.putText(stageCacheKey(orgId, hash), value, "application/json").catch(() => undefined),
  };
}

/** A reader that only knows one file: a server-side run's contract is a single uploaded file. */
function singleFile(path: string, text: string): SpecReader {
  const missing = () => Promise.reject(new Error("server-side runs take single-file contracts"));
  return {
    size: (file) => (file === path ? Promise.resolve(Buffer.byteLength(text)) : missing()),
    readText: (file) => (file === path ? Promise.resolve(text) : missing()),
    realpath: (file) => Promise.resolve(file),
  };
}

/**
 * Stage 1 for one uploaded contract, cached by the file's SHA-256 (known before anything is parsed): on a hit
 * the snapshot is restored and nothing is parsed, validated or normalised again.
 */
async function ingest(
  which: "base" | "head",
  file: EngineTask["base"],
  store: ObjectStore,
  cache: StageCache,
  port: MessagePort
): Promise<IngestedSpec> {
  const stage: StageName = `ingest.${which}`;
  port.postMessage({ stage, status: "started" } satisfies StageMessage);
  const text = await store.getText(file.key, MAX_SPEC_BYTES);
  if (text === undefined) throw new InputError("invalid_input", `The ${which} contract is missing from storage.`);
  const key = stageKey("ingest.file", { sha256: file.sha256, name: file.name });
  const finished = (spec: IngestedSpec, cacheHit: boolean) => {
    const hash = stageKey(stage, { source: spec.sourceHash });
    port.postMessage({ stage, status: "finished", cacheHit, hash } satisfies StageMessage);
    return spec;
  };

  const cached = await cache.get(key);
  if (cached !== undefined) {
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(cached);
    } catch {
      snapshot = undefined;
    }
    const revived = reviveSpec(snapshot, new Map([["", text]]));
    if (revived) return finished(revived, true);
  }

  const path = `/contract/${file.name}`;
  const result = await ingestSpec(path, { reader: singleFile(path, text), displayPath: () => file.name });
  if (!result.spec) {
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    const first = errors[0];
    const where = first?.line === undefined ? "" : `:${String(first.line)}:${String(first.column ?? 1)}`;
    throw new InputError(
      "invalid_spec",
      `The ${which} contract (${file.name}) is not a valid OpenAPI document: ${file.name}${where} ${first?.code ?? ""} ${first?.message ?? ""}`.trim() +
        (errors.length > 1 ? ` (and ${String(errors.length - 1)} more)` : "")
    );
  }
  await cache.put(key, JSON.stringify(snapshotSpec(result.spec)));
  return finished(result.spec, false);
}

/** Splits a byte stream into lines without holding the file in memory (recorded traffic can be large). */
async function* lines(stream: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    rest += decoder.decode(chunk, { stream: true });
    let index = rest.indexOf("\n");
    while (index !== -1) {
      yield rest.slice(0, index);
      rest = rest.slice(index + 1);
      index = rest.indexOf("\n");
    }
  }
  rest += decoder.decode();
  if (rest !== "") yield rest;
}

function trafficInput(traffic: NonNullable<EngineTask["traffic"]>, store: ObjectStore): TrafficInput {
  return {
    kind: traffic.format,
    file: traffic.name,
    hash: traffic.sha256,
    // Opened only when the Corpus stage is not in the cache.
    open: async function* () {
      if (traffic.format === "har") {
        const text = await store.getText(traffic.key, MAX_HAR_BYTES);
        if (text === undefined) throw new InputError("invalid_input", "The traffic file is missing from storage.");
        let har: unknown;
        try {
          har = JSON.parse(text);
        } catch {
          throw new InputError("invalid_input", `${traffic.name} is not a HAR file (it is not JSON).`);
        }
        yield* readHar(har);
        return;
      }
      const stream = await store.stream(traffic.key);
      if (!stream) throw new InputError("invalid_input", "The traffic file is missing from storage.");
      yield* readJsonl(lines(stream));
    },
  };
}

/**
 * One server-side run, in a worker thread (piscina): Ingest both contracts, then Diff → Corpus → Verify →
 * Classify through `compare`, with the organisation's stage cache. All engine logic is @drift/core; this file only
 * moves bytes between object storage and the engine and reports progress.
 *
 * It runs in a thread so that the comparison, which is CPU-bound, cannot block the process that renews the job's
 * lock and the semaphore lease; and so that a run that exceeds its time limit can be stopped by ending the thread.
 */
export default async function runEngine(task: EngineTask): Promise<EngineResult> {
  const store = storeFor(task.s3);
  const cache = storageCache(store, task.orgId);
  try {
    const base = await ingest("base", task.base, store, cache, task.port);
    const head = await ingest("head", task.head, store, cache, task.port);
    const report = await compare({
      base,
      head,
      asOf: task.asOf,
      cache,
      ...(task.traffic ? { traffic: trafficInput(task.traffic, store) } : {}),
      ...(task.policy ? { policy: task.policy } : {}),
      ...(task.ruleset ? { ruleset: task.ruleset } : {}),
      ...(task.failOn === undefined ? {} : { failOn: task.failOn }),
      ...(task.seed === undefined ? {} : { seed: task.seed }),
      onStage: (event) => {
        task.port.postMessage(
          (event.status === "started"
            ? { stage: event.stage, status: "started" }
            : {
                stage: event.stage,
                status: "finished",
                cacheHit: event.cached,
                hash: event.hash,
              }) satisfies StageMessage
        );
      },
    });
    return { ok: true, report };
  } catch (error) {
    if (error instanceof InputError) return { ok: false, category: error.category, message: error.message };
    throw error;
  } finally {
    // Not `close()`: closing a channel can drop messages still on their way. The receiver closes it on "end".
    task.port.postMessage({ status: "end" } satisfies StageMessage);
  }
}
