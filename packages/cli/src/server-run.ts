import { canonicalJson, sha256Hex, type Policy, type Ruleset } from "@drift/core";
import { checkedApiUrl, problemOf, UploadError } from "./upload.ts";

/** A file a server-side run takes: what it is called in the report, and its bytes. */
export interface RunFile {
  name: string;
  text: string;
}

export interface PlatformOptions {
  apiUrl: string;
  /** An API key with `runs:write` and `runs:read` (DRIFT_API_KEY). */
  apiKey: string;
  fetch: typeof globalThis.fetch;
}

export interface ServerRunOptions extends PlatformOptions {
  project: string;
  commit: string;
  branch?: string;
  pullRequest?: number;
  trigger: "ci" | "manual";
  base: RunFile;
  head: RunFile;
  traffic?: RunFile & { format: "jsonl" | "har" };
  policy?: Policy;
  rules?: Ruleset;
  failOn?: "breaking" | "risky";
  seed?: number;
}

export interface RerunOptions extends PlatformOptions {
  runId: string;
  /** A new corpus; `null` removes the traffic; left out, the run's own traffic is used again. */
  traffic?: (RunFile & { format: "jsonl" | "har" }) | null;
  policy?: Policy;
  rules?: Ruleset;
  failOn?: "breaking" | "risky";
  seed?: number;
}

export interface StartedRun {
  id: string;
  status: string;
  parentRunId?: string;
  /** True when the platform already had this run (the same request was made before). */
  replayed: boolean;
}

/** A run event as `GET /api/v1/runs/{id}/events` streams it (apps/web/openapi/drift-api.yaml). */
export type RunEvent =
  | { type: "run.queued"; at: string }
  | { type: "run.started"; at: string; attempt: number }
  | { type: "stage.started"; at: string; attempt: number; stage: string }
  | { type: "stage.finished"; at: string; attempt: number; stage: string; cacheHit: boolean; durationMs: number }
  | {
      type: "run.completed";
      at: string;
      gate: { passed: boolean; failOn: string };
      summary: { breaking: number; risky: number; safe: number; suppressed: number };
      semver: string;
    }
  | { type: "run.failed"; at: string; category: string; message: string; willRetry: boolean };

/** A file name the platform accepts (it is only displayed): the base name, with anything unusual replaced. */
export function fileName(path: string): string {
  const base = path.split(/[\\/:]/).at(-1) ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return (cleaned === "" ? "contract" : cleaned).slice(0, 255);
}

const TIMEOUT_MS = 60_000;

/** The platform's API with the key; requests never follow redirects, so the key cannot reach another host. */
function client(options: PlatformOptions) {
  const base = checkedApiUrl(options.apiUrl);
  const request = async (path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> => {
    let response: Response;
    try {
      response = await options.fetch(new URL(path, base), {
        ...init,
        redirect: "error",
        signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
        headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${options.apiKey}` },
      });
    } catch (error) {
      throw new UploadError(
        `drift: could not reach ${base.origin} (${error instanceof Error ? error.message : "request failed"})`
      );
    }
    if (!response.ok) {
      throw new UploadError(`drift: ${base.origin} refused: ${String(response.status)} ${await problemOf(response)}`);
    }
    return response;
  };
  return { base, request };
}

interface Created {
  run: { id: string; status: string; parentRunId?: string };
  uploads: { sha256: string; url: string }[];
}

/** PUTs each requested file to its pre-signed URL (without the API key), then completes the run if it waits. */
async function uploadAndComplete(
  api: ReturnType<typeof client>,
  fetch: typeof globalThis.fetch,
  created: Created,
  files: (RunFile & { contentType: string })[]
): Promise<string> {
  for (const upload of created.uploads) {
    const file = files.find((candidate) => sha256Hex(candidate.text) === upload.sha256);
    if (!file) throw new UploadError("drift: the platform asked for a file this run does not have");
    let stored: Response;
    try {
      stored = await fetch(upload.url, {
        method: "PUT",
        headers: { "content-type": file.contentType },
        body: file.text,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new UploadError(
        `drift: could not store ${file.name} (${error instanceof Error ? error.message : "request failed"})`
      );
    }
    if (!stored.ok) throw new UploadError(`drift: could not store ${file.name}: ${String(stored.status)}`);
  }
  if (created.run.status !== "uploading") return created.run.status;
  const done = await api.request(`/api/v1/runs/${encodeURIComponent(created.run.id)}/complete`, { method: "POST" });
  return ((await done.json()) as { status: string }).status;
}

const described = (file: RunFile) => ({
  name: file.name,
  sha256: sha256Hex(file.text),
  size: Buffer.byteLength(file.text),
});
const trafficType = (format: "jsonl" | "har") => (format === "har" ? "application/json" : "application/x-ndjson");

/**
 * Starts a server-side run (PLAN M6): the platform's worker compares the contracts. `POST
 * /api/v1/projects/{project}/runs`, a PUT of each file the platform does not have yet, then `complete`. The
 * Idempotency-Key is the hash of the request, so repeating it (a re-run CI job) returns the same run.
 */
export async function startServerRun(options: ServerRunOptions): Promise<StartedRun> {
  const api = client(options);
  const body = {
    trigger: options.trigger,
    commit: options.commit,
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.pullRequest === undefined ? {} : { pullRequest: options.pullRequest }),
    base: described(options.base),
    head: described(options.head),
    ...(options.traffic ? { traffic: { ...described(options.traffic), format: options.traffic.format } } : {}),
    ...(options.policy ? { policy: options.policy } : {}),
    ...(options.rules ? { rules: options.rules } : {}),
    ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  };
  const response = await api.request(`/api/v1/projects/${encodeURIComponent(options.project)}/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `drift-cli:${sha256Hex(canonicalJson({ project: options.project, ...body }))}`,
    },
    body: JSON.stringify(body),
  });
  const created = (await response.json()) as Created;
  const status = await uploadAndComplete(api, options.fetch, created, [
    { ...options.base, contentType: "application/yaml" },
    { ...options.head, contentType: "application/yaml" },
    ...(options.traffic ? [{ ...options.traffic, contentType: trafficType(options.traffic.format) }] : []),
  ]);
  return { id: created.run.id, status, replayed: response.status === 200 };
}

/** Re-runs a server-side run with a new corpus, policy, fail-on or seed: a child run (`POST .../rerun`). */
export async function startRerun(options: RerunOptions): Promise<StartedRun> {
  const api = client(options);
  const traffic = options.traffic;
  const body = {
    ...(traffic === undefined
      ? {}
      : { traffic: traffic === null ? null : { ...described(traffic), format: traffic.format } }),
    ...(options.policy ? { policy: options.policy } : {}),
    ...(options.rules ? { rules: options.rules } : {}),
    ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  };
  const response = await api.request(`/api/v1/runs/${encodeURIComponent(options.runId)}/rerun`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const created = (await response.json()) as Created;
  const status = await uploadAndComplete(
    api,
    options.fetch,
    created,
    traffic ? [{ ...traffic, contentType: trafficType(traffic.format) }] : []
  );
  return {
    id: created.run.id,
    status,
    replayed: false,
    ...(created.run.parentRunId === undefined ? {} : { parentRunId: created.run.parentRunId }),
  };
}

const isFinal = (event: RunEvent) =>
  event.type === "run.completed" || (event.type === "run.failed" && !event.willRetry);

/**
 * Follows a run's events (Server-Sent Events) until its final one, which it returns. A dropped connection is
 * resumed with `Last-Event-ID`, so no event is lost or repeated; after `maxReconnects` drops in a row it gives up.
 */
export async function followRun(
  options: PlatformOptions & {
    runId: string;
    onEvent: (event: RunEvent) => void;
    maxReconnects?: number;
    reconnectDelayMs?: number;
    /** Gives up waiting after this long (the platform's own run time limit is the usual bound). */
    timeoutMs?: number;
  }
): Promise<RunEvent> {
  const api = client(options);
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 30 * 60 * 1000);
  let lastEventId: string | undefined;
  let drops = 0;
  for (;;) {
    let final: RunEvent | undefined;
    try {
      const response = await api.request(
        `/api/v1/runs/${encodeURIComponent(options.runId)}/events`,
        {
          headers: {
            accept: "text/event-stream",
            ...(lastEventId === undefined ? {} : { "last-event-id": lastEventId }),
          },
        },
        deadline
      );
      if (!response.body) throw new UploadError("drift: the event stream has no body");
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
          let id: string | undefined;
          let data: string | undefined;
          for (const line of frame.split("\n")) {
            if (line.startsWith("id: ")) id = line.slice(4);
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (data === undefined) continue; // a keep-alive comment
          if (id !== undefined) lastEventId = id;
          drops = 0;
          const event = JSON.parse(data) as RunEvent;
          options.onEvent(event);
          if (isFinal(event)) final = event;
        }
      }
    } catch (error) {
      if (deadline.aborted) throw new UploadError("drift: gave up waiting for the run to finish");
      // A refusal (401, 404) will not go away by retrying; a dropped connection may.
      if (error instanceof UploadError && / refused: 4\d\d /.test(error.message)) throw error;
    }
    if (final) return final;
    drops += 1;
    if (drops > (options.maxReconnects ?? 5)) {
      throw new UploadError("drift: lost the connection to the run's event stream");
    }
    await new Promise((resolve) => setTimeout(resolve, options.reconnectDelayMs ?? 1000 * drops));
  }
}
