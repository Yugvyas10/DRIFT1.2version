import { canonicalJson, renderReport, sha256Hex } from "@drift/core";
import type { Report } from "@drift/report-schema";

/** Raised when an upload cannot be made or the platform refuses it. The message never contains the API key. */
export class UploadError extends Error {}

export interface UploadOptions {
  /** Base URL of the DRIFT platform, e.g. https://drift.example. */
  apiUrl: string;
  /** An API key with `runs:write` (DRIFT_API_KEY). */
  apiKey: string;
  /** The project's slug. */
  project: string;
  commit: string;
  branch?: string;
  pullRequest?: number;
  trigger: "ci" | "manual";
  fetch: typeof globalThis.fetch;
}

const ARTIFACTS = [
  { kind: "report-json", format: "json", contentType: "application/json" },
  { kind: "report-md", format: "md", contentType: "text/markdown" },
  { kind: "report-html", format: "html", contentType: "text/html" },
  { kind: "report-sarif", format: "sarif", contentType: "application/sarif+json" },
] as const;

const TIMEOUT_MS = 60_000;

/**
 * The platform's base URL. The API key is only ever sent over HTTPS, or to this machine (local development):
 * a plain-HTTP URL to anywhere else is refused before any request is made.
 */
export function checkedApiUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UploadError(`drift: "${value}" is not a URL (set --api-url or DRIFT_API_URL)`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new UploadError("drift: the API URL must use https (plain http is only allowed for localhost)");
  }
  return url;
}

export async function problemOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { title?: unknown; detail?: unknown };
    const parts = [body.title, body.detail].filter((part): part is string => typeof part === "string");
    if (parts.length > 0) return parts.join(": ");
  } catch {
    // not a problem document
  }
  return response.statusText || "request failed";
}

/**
 * Uploads a report as a run (apps/web/openapi/drift-api.yaml): `POST /api/v1/runs`, a PUT of each artifact to its
 * pre-signed URL, then `POST /api/v1/runs/{id}/complete`.
 *
 * The Idempotency-Key is the hash of the request, so repeating the same upload (a re-run CI job) returns the same
 * run instead of creating another. Requests to the API never follow redirects, so the key cannot be forwarded
 * to another host; it is not sent to the storage URLs at all.
 */
export async function uploadReport(
  report: Report,
  options: UploadOptions
): Promise<{ runId: string; replayed: boolean }> {
  const base = checkedApiUrl(options.apiUrl);
  const files = ARTIFACTS.map((artifact) => {
    const content = renderReport(report, artifact.format);
    return { ...artifact, content, sha256: sha256Hex(content), size: Buffer.byteLength(content) };
  });
  const body = {
    project: options.project,
    trigger: options.trigger,
    commit: options.commit,
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.pullRequest === undefined ? {} : { pullRequest: options.pullRequest }),
    report,
    artifacts: files.map(({ kind, sha256, size, contentType }) => ({ kind, sha256, size, contentType })),
  };
  const api = async (path: string, init: RequestInit): Promise<Response> => {
    let response: Response;
    try {
      response = await options.fetch(new URL(path, base), {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${options.apiKey}` },
      });
    } catch (error) {
      throw new UploadError(
        `drift: could not reach ${base.origin} (${error instanceof Error ? error.message : "request failed"})`
      );
    }
    if (!response.ok) {
      throw new UploadError(
        `drift: upload refused by ${base.origin}: ${String(response.status)} ${await problemOf(response)}`
      );
    }
    return response;
  };

  const created = await api("/api/v1/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `drift-cli:${sha256Hex(canonicalJson(body))}`,
    },
    body: JSON.stringify(body),
  });
  const { run, uploads } = (await created.json()) as { run: { id: string }; uploads: { kind: string; url: string }[] };
  for (const upload of uploads) {
    const file = files.find((candidate) => candidate.kind === upload.kind);
    if (!file) continue;
    let stored: Response;
    try {
      stored = await options.fetch(upload.url, {
        method: "PUT",
        headers: { "content-type": file.contentType },
        body: file.content,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new UploadError(
        `drift: could not store ${upload.kind} (${error instanceof Error ? error.message : "request failed"})`
      );
    }
    if (!stored.ok) throw new UploadError(`drift: could not store ${upload.kind}: ${String(stored.status)}`);
  }
  await api(`/api/v1/runs/${encodeURIComponent(run.id)}/complete`, { method: "POST" });
  return { runId: run.id, replayed: created.status === 200 };
}
