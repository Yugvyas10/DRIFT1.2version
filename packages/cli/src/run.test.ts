import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ExitCode } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { runCli } from "./program.ts";
import { fileName, followRun, type RunEvent } from "./server-run.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const COMMIT = "d".repeat(40);
// Not a real key: assembled here so no secret-looking literal sits in the repository.
const KEY = ["drift", "y".repeat(43)].join("_");
const RUN = "run_abcdefghijklmnopqrstuvwx";
const CHILD = "run_zyxwvutsrqponmlkjihgfedc";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

const at = "2026-10-03T10:00:00.000Z";
const completed = (passed: boolean): RunEvent => ({
  type: "run.completed",
  at,
  gate: { passed, failOn: "breaking" },
  summary: { breaking: passed ? 0 : 2, risky: 1, safe: 4, suppressed: 0 },
  semver: passed ? "minor" : "major",
});
const stages = (cacheHit: boolean): RunEvent[] =>
  ["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"].flatMap((stage) => [
    { type: "stage.started", at, attempt: 1, stage },
    { type: "stage.finished", at, attempt: 1, stage, cacheHit: cacheHit && stage !== "corpus", durationMs: 4 },
  ]);

const sse = (events: { id?: string; event: RunEvent }[], comment = false) =>
  (comment ? ": keep-alive\n\n" : "") +
  events
    .map(
      ({ id, event }) =>
        `${id === undefined ? "" : `id: ${id}\n`}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    )
    .join("");

/**
 * A fake platform: answers like apps/web (create → PUT uploads → complete, rerun, events). `streams` are the
 * successive event-stream connections; each is a list of events, and a stream without a final event ends as a
 * dropped connection would.
 */
function platform(
  options: {
    known?: boolean;
    streams?: RunEvent[][];
    createStatus?: number;
    eventsStatus?: number;
  } = {}
) {
  const seen: Seen[] = [];
  let connection = 0;
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
    );
    seen.push({ method: init?.method ?? "GET", url, headers, body: typeof init?.body === "string" ? init.body : "" });
    const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
    const path = url.startsWith("https://drift.example") ? new URL(url).pathname : url;
    if (path.endsWith("/runs") && path.startsWith("/api/v1/projects/")) {
      if (options.createStatus !== undefined && options.createStatus >= 400) {
        return json(options.createStatus, { title: "Forbidden", detail: "The API key lacks runs:write." });
      }
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, { sha256: string }>;
      const files = (["base", "head", "traffic"] as const).flatMap((kind) =>
        body[kind] ? [{ kind: `input-${kind}`, sha256: body[kind].sha256 }] : []
      );
      return json(options.createStatus ?? 201, {
        run: { id: RUN, status: options.known ? "queued" : "uploading" },
        uploads: options.known ? [] : files.map((file) => ({ ...file, url: `http://storage.test/${file.kind}?sig=1` })),
      });
    }
    if (path.endsWith("/rerun")) {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        traffic?: { sha256: string } | null;
      };
      return json(201, {
        run: { id: CHILD, status: body.traffic ? "uploading" : "queued", parentRunId: RUN },
        uploads: body.traffic
          ? [{ kind: "input-traffic", sha256: body.traffic.sha256, url: "http://storage.test/t?sig=1" }]
          : [],
      });
    }
    if (url.startsWith("http://storage.test/")) return Promise.resolve(new Response(null, { status: 200 }));
    if (path.endsWith("/complete")) return json(200, { id: RUN, status: "queued" });
    if (path.endsWith("/events")) {
      if (options.eventsStatus !== undefined) return json(options.eventsStatus, { title: "Not found" });
      const streams = options.streams ?? [
        [{ type: "run.queued", at }, { type: "run.started", at, attempt: 1 }, ...stages(false), completed(false)],
      ];
      const index = connection;
      connection += 1;
      const offset = streams.slice(0, index).reduce((total, stream) => total + stream.length, 0);
      const events = (streams[index] ?? []).map((event, i) => ({ id: `1700000000000-${String(offset + i)}`, event }));
      return Promise.resolve(
        new Response(sse(events, index === 0), { status: 200, headers: { "content-type": "text/event-stream" } })
      );
    }
    return json(404, { title: "Not found" });
  };
  return { fetch, seen };
}

async function drift(args: string[], fetch: typeof globalThis.fetch, env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(
    args,
    {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      env: { DRIFT_API_KEY: KEY, DRIFT_API_URL: "https://drift.example", ...env },
      fetch,
    },
    repo
  );
  return { code, stdout: out.join(""), stderr: err.join("") };
}

const run = [
  "run",
  "--base",
  "examples/petstore/v1.yaml",
  "--head",
  "examples/petstore/v2-breaking.yaml",
  "--project",
  "petstore",
  "--commit",
  COMMIT,
];

describe("drift run", () => {
  it("uploads the inputs, completes the run, follows it live, and exits with the gate", async () => {
    const { fetch, seen } = platform();
    const result = await drift(
      [...run, "--traffic", "examples/petstore/traffic.jsonl", "--fail-on", "breaking", "--seed", "3"],
      fetch,
      {
        CI: "true",
        GITHUB_HEAD_REF: "feature/x",
      }
    );
    expect(result.code).toBe(ExitCode.GateFailed);
    expect(result.stdout).toBe(
      [
        // The run.queued event is not repeated: the first line already says so.
        `run ${RUN}  queued`,
        "started   attempt 1",
        ...["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"].map(
          (stage) => `  ${stage.padEnd(12)} computed      4 ms`
        ),
        "gate FAILED (fail-on breaking): 2 breaking, 1 risky, 4 safe, 0 suppressed · semver major",
        "",
      ].join("\n")
    );

    const create = seen[0];
    expect(create).toMatchObject({ method: "POST", url: "https://drift.example/api/v1/projects/petstore/runs" });
    expect(create?.headers["idempotency-key"]).toMatch(/^drift-cli:[0-9a-f]{64}$/);
    const v1 = readFileSync(`${repo}examples/petstore/v1.yaml`, "utf8");
    expect(JSON.parse(create?.body ?? "{}")).toEqual({
      trigger: "ci",
      commit: COMMIT,
      branch: "feature/x",
      base: { name: "v1.yaml", sha256: sha256(v1), size: Buffer.byteLength(v1) },
      head: expect.objectContaining({ name: "v2-breaking.yaml" }) as unknown,
      traffic: expect.objectContaining({ name: "traffic.jsonl", format: "jsonl" }) as unknown,
      failOn: "breaking",
      seed: 3,
    });
    const puts = seen.filter((request) => request.method === "PUT");
    expect(puts.map((put) => put.url)).toEqual([
      "http://storage.test/input-base?sig=1",
      "http://storage.test/input-head?sig=1",
      "http://storage.test/input-traffic?sig=1",
    ]);
    expect(puts.every((put) => put.headers.authorization === undefined)).toBe(true);
    expect(puts[0]?.body).toBe(v1);
    expect(seen.find((request) => request.url.endsWith("/complete"))).toBeDefined();
    expect(seen.at(-1)).toMatchObject({ url: `https://drift.example/api/v1/runs/${RUN}/events` });
    expect(result.stdout + result.stderr).not.toContain(KEY);
  });

  it("needs no upload or completion when the platform has every file, and exits 0 when the gate passes", async () => {
    const { fetch, seen } = platform({
      known: true,
      streams: [[{ type: "run.started", at, attempt: 1 }, ...stages(true), completed(true)]],
    });
    const result = await drift(run, fetch);
    expect(result.code).toBe(ExitCode.Pass);
    expect(result.stdout).toContain("  diff         cached        4 ms\n");
    expect(result.stdout).toContain("gate passed");
    expect(seen.some((request) => request.method === "PUT" || request.url.endsWith("/complete"))).toBe(false);
  });

  it("resumes a dropped event stream with Last-Event-ID, and reports retries", async () => {
    const { fetch, seen } = platform({
      streams: [
        [
          { type: "run.queued", at },
          { type: "run.started", at, attempt: 1 },
        ],
        [
          { type: "run.failed", at, category: "internal", message: "The run failed unexpectedly.", willRetry: true },
          { type: "run.started", at, attempt: 2 },
          completed(true),
        ],
      ],
    });
    const result = await drift([...run, "--no-wait"], fetch);
    expect(result.stdout).toBe(`run ${RUN}  queued\n`);
    expect(seen.some((request) => request.url.endsWith("/events"))).toBe(false);

    const followed = await runCli(
      [...run],
      {
        stdout: () => undefined,
        stderr: () => undefined,
        env: { DRIFT_API_KEY: KEY, DRIFT_API_URL: "https://drift.example" },
        fetch,
      },
      repo
    );
    expect(followed).toBe(ExitCode.Pass);
    const connections = seen.filter((request) => request.url.endsWith("/events"));
    expect(connections.map((request) => request.headers["last-event-id"])).toEqual([undefined, "1700000000000-1"]);
  });

  it("exits 2 when the run fails on bad input, 3 when the platform fails it", async () => {
    const invalid = platform({
      streams: [
        [
          {
            type: "run.failed",
            at,
            category: "invalid_spec",
            message: "The head contract is not valid.",
            willRetry: false,
          },
        ],
      ],
    });
    const bad = await drift(run, invalid.fetch);
    expect(bad.code).toBe(ExitCode.UsageError);
    expect(bad.stderr).toBe("drift: the run failed (invalid_spec): The head contract is not valid.\n");

    const broken = platform({
      streams: [[{ type: "run.failed", at, category: "timeout", message: "Too slow.", willRetry: false }]],
    });
    expect((await drift(run, broken.fetch)).code).toBe(ExitCode.InternalError);
  });

  it("explains refusals and bad flags with exit 2, before or without following", async () => {
    const refused = await drift(run, platform({ createStatus: 403 }).fetch);
    expect(refused).toMatchObject({
      code: ExitCode.UsageError,
      stderr: "drift: https://drift.example refused: 403 Forbidden: The API key lacks runs:write.\n",
    });
    const gone = await drift(run, platform({ eventsStatus: 404 }).fetch);
    expect(gone.stderr).toBe("drift: https://drift.example refused: 404 Not found\n");

    const fetch = platform().fetch;
    for (const [args, env, message] of [
      [["run", "--project", "p"], {}, "drift: --base and --head are required\n"],
      [run.filter((arg) => arg !== "--project" && arg !== "petstore"), {}, "drift: run needs --project <slug>\n"],
      [[...run, "--pr", "x"], {}, "drift: --pr must be a pull request number\n"],
      [[...run, "--seed", "-1"], {}, "drift: --seed must be a whole number, 0 or more\n"],
      [run, { DRIFT_API_KEY: "" }, "drift: run needs an API key in DRIFT_API_KEY\n"],
      [run, { DRIFT_API_URL: "" }, "drift: run needs --api-url <url> or DRIFT_API_URL\n"],
      [
        [...run, "--api-url", "http://drift.example"],
        {},
        "drift: the API URL must use https (plain http is only allowed for localhost)\n",
      ],
      [
        ["run", "--base", "nope.yaml", "--head", "nope.yaml", "--project", "p", "--commit", COMMIT],
        {},
        "drift: cannot read nope.yaml\n",
      ],
      [
        ["run", "--base", "HEAD:no/such/file.yaml", "--head", "x", "--project", "p", "--commit", COMMIT],
        {},
        "drift: cannot read HEAD:no/such/file.yaml from git\n",
      ],
    ] as const) {
      const result = await drift([...args], fetch, env);
      expect(result.code, args.join(" ")).toBe(ExitCode.UsageError);
      expect(result.stderr).toBe(message);
    }
  });

  it("reads a contract from git with <ref>:<path>", async () => {
    const { fetch, seen } = platform({ known: true, streams: [[completed(true)]] });
    const result = await drift(
      [
        "run",
        "--base",
        "HEAD:examples/petstore/v1.yaml",
        "--head",
        "examples/petstore/v1.yaml",
        "--project",
        "p",
        "--commit",
        COMMIT,
      ],
      fetch
    );
    expect(result.code).toBe(ExitCode.Pass);
    const body = JSON.parse(seen[0]?.body ?? "{}") as {
      base: { name: string; sha256: string };
      head: { sha256: string };
    };
    expect(body.base.name).toBe("v1.yaml");
  });
});

describe("drift rerun", () => {
  it("re-runs with new traffic as a child run, uploading only the traffic", async () => {
    const { fetch, seen } = platform({
      streams: [[{ type: "run.started", at, attempt: 1 }, ...stages(true), completed(false)]],
    });
    const result = await drift(
      ["rerun", RUN, "--traffic", "examples/petstore/traffic.jsonl", "--fail-on", "risky"],
      fetch
    );
    expect(result.code).toBe(ExitCode.GateFailed);
    expect(result.stdout.split("\n")[0]).toBe(`run ${CHILD} (re-run of ${RUN})  queued`);
    expect(result.stdout).toContain(
      "  ingest.base  cached        4 ms\n  ingest.head  cached        4 ms\n  diff         cached"
    );
    expect(result.stdout).toContain("  corpus       computed");
    expect(seen[0]).toMatchObject({ method: "POST", url: `https://drift.example/api/v1/runs/${RUN}/rerun` });
    expect(JSON.parse(seen[0]?.body ?? "{}")).toMatchObject({
      traffic: { name: "traffic.jsonl", format: "jsonl" },
      failOn: "risky",
    });
    expect(seen.filter((request) => request.method === "PUT").map((put) => put.url)).toEqual([
      "http://storage.test/t?sig=1",
    ]);
  });

  it("re-runs without traffic, and with a policy and a ruleset file", async () => {
    const { fetch, seen } = platform({ streams: [[completed(true)]] });
    const result = await drift(
      [
        "rerun",
        RUN,
        "--no-traffic",
        "--policy",
        "apps/web/openapi/drift-policy.yaml",
        "--rules",
        "packages/rules/src/default-rules.json",
        "--seed",
        "9",
      ],
      fetch
    );
    expect(result.code).toBe(ExitCode.Pass);
    const body = JSON.parse(seen[0]?.body ?? "{}") as {
      traffic: null;
      policy: { format: string };
      rules: { format: string };
      seed: number;
    };
    expect(body.rules.format).toBe("drift-rules/v1");
    expect(body.traffic).toBeNull();
    expect(body.policy.format).toBe("drift-policy/v1");
    expect(body.seed).toBe(9);
    expect(seen.some((request) => request.method === "PUT")).toBe(false);
  });
});

describe("followRun", () => {
  it("gives up after too many dropped connections in a row", async () => {
    const { fetch } = platform({ streams: [[], [], []] });
    await expect(
      followRun({
        apiUrl: "https://drift.example",
        apiKey: KEY,
        fetch,
        runId: RUN,
        onEvent: () => undefined,
        maxReconnects: 2,
        reconnectDelayMs: 1,
      })
    ).rejects.toThrow("drift: lost the connection to the run's event stream");
  });

  it("gives up when the run takes longer than the time it waits", async () => {
    const hanging: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    await expect(
      followRun({
        apiUrl: "https://drift.example",
        apiKey: KEY,
        fetch: hanging,
        runId: RUN,
        onEvent: () => undefined,
        timeoutMs: 20,
      })
    ).rejects.toThrow("drift: gave up waiting for the run to finish");
  });
});

describe("fileName", () => {
  it("keeps a plain base name and replaces what the platform does not accept", () => {
    expect(fileName("api/openapi.yaml")).toBe("openapi.yaml");
    expect(fileName("origin/main:api/open api (v2).yaml")).toBe("open-api--v2-.yaml");
    expect(fileName("C:\\specs\\.hidden.yaml")).toBe("hidden.yaml");
    expect(fileName("dir/")).toBe("contract");
  });
});
