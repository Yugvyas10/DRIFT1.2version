import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ExitCode } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { runCli } from "./program.ts";
import { checkedApiUrl, UploadError } from "./upload.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const COMMIT = "c".repeat(40);
// Not a real key: assembled here so no secret-looking literal sits in the repository.
const KEY = ["drift", "x".repeat(43)].join("_");

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** A fake platform: records every request and answers like apps/web (create → PUT uploads → complete). */
function platform(
  options: { createStatus?: number; putStatus?: number; problem?: unknown; uploads?: boolean; offline?: boolean } = {}
) {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
    );
    seen.push({ method: init?.method ?? "GET", url, headers, body: typeof init?.body === "string" ? init.body : "" });
    if (options.offline) return Promise.reject(new TypeError("fetch failed"));
    const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (url.endsWith("/api/v1/runs")) {
      const status = options.createStatus ?? 201;
      if (status >= 400)
        return json(
          status,
          options.problem ?? { title: "Unauthorized", detail: "A valid API key or session is required." }
        );
      const sent = typeof init?.body === "string" ? init.body : "{}";
      const announced = (JSON.parse(sent) as { artifacts: { kind: string }[] }).artifacts;
      const uploads =
        options.uploads === false
          ? []
          : announced.map((a) => ({ kind: a.kind, url: `http://storage.test/put/${a.kind}?X-Amz-Signature=abc` }));
      return json(status, { run: { id: "run_abcdefghijklmnopqrstuvwx" }, uploads });
    }
    if (url.startsWith("http://storage.test/"))
      return Promise.resolve(new Response(null, { status: options.putStatus ?? 200 }));
    if (url.endsWith("/complete")) return json(200, { id: "run_abcdefghijklmnopqrstuvwx", status: "complete" });
    return json(404, { title: "Not found" });
  };
  return { fetch, seen };
}

async function drift(args: string[], env: Record<string, string | undefined>, fetch?: typeof globalThis.fetch) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(
    [
      "compare",
      "--base",
      "examples/petstore/v1.yaml",
      "--head",
      "examples/petstore/v2-additive.yaml",
      "--no-cache",
      "--as-of",
      "2026-10-01",
      ...args,
    ],
    { stdout: (t) => out.push(t), stderr: (t) => err.push(t), env, ...(fetch ? { fetch } : {}) },
    repo
  );
  return { code, stdout: out.join(""), stderr: err.join("") };
}

const upload = ["--upload", "--project", "petstore", "--commit", COMMIT];
const env = { DRIFT_API_KEY: KEY, DRIFT_API_URL: "https://drift.example" };

describe("drift compare --upload", () => {
  it("creates the run, stores every artifact through its pre-signed URL, and completes it", async () => {
    const { fetch, seen } = platform();
    const result = await drift([...upload, "--branch", "feature/x", "--pr", "7"], { ...env, CI: "true" }, fetch);
    expect(result.code).toBe(ExitCode.Pass);
    expect(result.stdout).toContain("uploaded  run run_abcdefghijklmnopqrstuvwx\n");

    const [create, ...rest] = seen;
    expect(create).toMatchObject({ method: "POST", url: "https://drift.example/api/v1/runs" });
    expect(create?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(create?.headers["idempotency-key"]).toMatch(/^drift-cli:[0-9a-f]{64}$/);
    const body = JSON.parse(create?.body ?? "{}") as {
      report: { format: string };
      artifacts: { kind: string; sha256: string; size: number }[];
    };
    expect(body).toMatchObject({
      project: "petstore",
      trigger: "ci",
      commit: COMMIT,
      branch: "feature/x",
      pullRequest: 7,
      report: { format: "drift-report/v1" },
    });
    expect(body.artifacts.map((a) => a.kind)).toEqual(["report-json", "report-md", "report-html", "report-sarif"]);

    const puts = rest.filter((request) => request.method === "PUT");
    expect(puts).toHaveLength(4);
    for (const put of puts) {
      const announced = body.artifacts.find((a) => put.url.includes(`/put/${a.kind}?`));
      expect(createHash("sha256").update(put.body).digest("hex")).toBe(announced?.sha256);
      expect(Buffer.byteLength(put.body)).toBe(announced?.size);
      // The API key goes to the platform only, never to the storage URLs.
      expect(put.headers.authorization).toBeUndefined();
    }
    expect(seen.at(-1)).toMatchObject({
      method: "POST",
      url: "https://drift.example/api/v1/runs/run_abcdefghijklmnopqrstuvwx/complete",
    });
    expect(result.stdout + result.stderr).not.toContain(KEY);
  });

  it("sends the same Idempotency-Key for the same upload, and says when the run already existed", async () => {
    const first = platform();
    const second = platform({ createStatus: 200, uploads: false });
    await drift(upload, env, first.fetch);
    const again = await drift(upload, env, second.fetch);
    expect(again.stdout).toContain("uploaded  run run_abcdefghijklmnopqrstuvwx (already uploaded: same run)");
    expect(second.seen[0]?.headers["idempotency-key"]).toBe(first.seen[0]?.headers["idempotency-key"]);
    expect(second.seen.filter((request) => request.method === "PUT")).toEqual([]);
    expect(JSON.parse(first.seen[0]?.body ?? "{}")).toMatchObject({ trigger: "manual" }); // no CI variable
  });

  it("still prints the report and exits 2 when the platform refuses or cannot be reached", async () => {
    const refused = await drift(upload, env, platform({ createStatus: 401 }).fetch);
    expect(refused.code).toBe(ExitCode.UsageError);
    expect(refused.stdout).toContain("gate passed");
    expect(refused.stderr).toBe(
      "drift: upload refused by https://drift.example: 401 Unauthorized: A valid API key or session is required.\n"
    );

    const plain = await drift(upload, env, platform({ createStatus: 500, problem: "not json" }).fetch);
    expect(plain.stderr).toMatch(/^drift: upload refused by https:\/\/drift\.example: 500 /);
    const offline = await drift(upload, env, platform({ offline: true }).fetch);
    expect(offline.stderr).toBe("drift: could not reach https://drift.example (fetch failed)\n");
    const storage = await drift(upload, env, platform({ putStatus: 403 }).fetch);
    expect(storage.stderr).toBe("drift: could not store report-json: 403\n");
    for (const output of [refused, plain, offline, storage]) expect(output.stdout + output.stderr).not.toContain(KEY);
  });

  it("explains what is missing, before any request", async () => {
    const { fetch, seen } = platform();
    const cases: [string[], Record<string, string | undefined>, RegExp][] = [
      [upload, { DRIFT_API_URL: env.DRIFT_API_URL }, /needs an API key in DRIFT_API_KEY/],
      [upload, { DRIFT_API_KEY: KEY }, /needs --api-url <url> or DRIFT_API_URL/],
      [["--upload", "--commit", COMMIT], env, /needs --project <slug>/],
      [[...upload.slice(0, 3), "--commit", "abc123"], env, /--commit must be a full commit SHA/],
      [[...upload, "--pr", "seven"], env, /--pr must be a pull request number/],
      [[...upload, "--api-url", "http://drift.example"], env, /must use https/],
      [[...upload, "--api-url", "not a url"], env, /is not a URL/],
    ];
    for (const [args, variables, message] of cases) {
      const result = await drift(args, variables, fetch);
      expect(result.code, String(message)).toBe(ExitCode.UsageError);
      expect(result.stderr).toMatch(message);
    }
    expect((await drift(upload, env)).stderr).toContain("uploading is not available here");
    expect(seen).toEqual([]);
  });

  it("takes the commit from GITHUB_SHA or the repository when --commit is not given", async () => {
    const ci = platform();
    await drift(
      ["--upload", "--project", "petstore"],
      { ...env, GITHUB_SHA: "d".repeat(40), GITHUB_REF_NAME: "main" },
      ci.fetch
    );
    expect(JSON.parse(ci.seen[0]?.body ?? "{}")).toMatchObject({ commit: "d".repeat(40), branch: "main" });
    const local = platform();
    await drift(["--upload", "--project", "petstore"], env, local.fetch);
    expect((JSON.parse(local.seen[0]?.body ?? "{}") as { commit: string }).commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("checkedApiUrl", () => {
  it("allows https anywhere and plain http only on this machine", () => {
    expect(checkedApiUrl("https://drift.example/").origin).toBe("https://drift.example");
    for (const local of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "http://drift.localhost:3000",
    ]) {
      expect(checkedApiUrl(local).protocol).toBe("http:");
    }
    for (const bad of [
      "http://drift.example",
      "http://localhost.evil.example",
      "ftp://drift.example",
      "drift.example",
    ]) {
      expect(() => checkedApiUrl(bad)).toThrow(UploadError);
    }
  });
});
