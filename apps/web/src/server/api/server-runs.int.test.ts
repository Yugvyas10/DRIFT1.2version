import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DEFAULT_RULESET } from "@drift/core";
import { newId } from "@drift/db";
import { publishRunEvent, type RunEvent } from "@drift/platform";
import { beforeAll, describe, expect, it } from "vitest";
import type { RunView, UploadView } from "../services/runs";
import type { StageView } from "../services/server-runs";
import { harness } from "../testing/harness";
import { dispatch } from "./routes";

const h = harness();
const examples = new URL("../../../../../examples/", import.meta.url);
const COMMIT = "b".repeat(40);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

interface Created {
  run: RunView;
  uploads: UploadView[];
}
interface File {
  name: string;
  text: string;
}
let v1: File;
let v2: File;
let traffic: File;

beforeAll(async () => {
  const read = (path: string) => readFile(new URL(path, examples), "utf8");
  v1 = { name: "v1.yaml", text: await read("petstore/v1.yaml") };
  v2 = { name: "v2-breaking.yaml", text: await read("petstore/v2-breaking.yaml") };
  traffic = { name: "traffic.jsonl", text: await read("petstore/traffic.jsonl") };
});

const described = (file: File) => ({ name: file.name, sha256: sha256(file.text), size: Buffer.byteLength(file.text) });

async function setup(permissions: string[] = ["runs:read", "runs:write"]) {
  const org = await h.org();
  const project = h.unique("api");
  await h.call("POST", `/api/v1/orgs/${org.slug}/projects`, { user: org.owner, body: { name: "API", slug: project } });
  const created = await h.call<{ key: string }>("POST", `/api/v1/orgs/${org.slug}/keys`, {
    user: org.owner,
    body: { name: "CI", permissions },
  });
  return { ...org, project, key: created.body.key };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function createRun(t: Setup, body: Record<string, unknown>, key = h.unique("idem")) {
  return h.call<Created>("POST", `/api/v1/projects/${t.project}/runs`, {
    key: t.key,
    headers: { "idempotency-key": key },
    body: { trigger: "ci", commit: COMMIT, base: described(v1), head: described(v2), ...body },
  });
}

/** Uploads each requested file to its pre-signed URL. */
async function uploadAll(uploads: UploadView[], files: File[]) {
  for (const upload of uploads) {
    const file = files.find((candidate) => sha256(candidate.text) === upload.sha256);
    if (!file) throw new Error(`no file for ${upload.kind}`);
    const contentType = upload.kind === "input-traffic" ? "application/x-ndjson" : "application/yaml";
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: file.text,
    });
    expect(response.status).toBe(200);
  }
}

const isQueued = async (runId: string) => (await h.redis.exists(`bull:drift-runs:${runId}`)) === 1;

describe("server-side runs", () => {
  it("takes the inputs through pre-signed URLs, then queues the run and records the event", async () => {
    const t = await setup();
    const created = await createRun(t, {
      traffic: { ...described(traffic), format: "jsonl" },
      failOn: "risky",
      seed: 7,
    });
    expect(created.status).toBe(201);
    const { run, uploads } = created.body;
    expect(run).toMatchObject({
      project: t.project,
      status: "uploading",
      mode: "server",
      trigger: "ci",
      commit: COMMIT,
    });
    expect(run).not.toHaveProperty("gate");
    expect(uploads.map((upload) => upload.kind)).toEqual(["input-base", "input-head", "input-traffic"]);
    expect(new URL(uploads[0]?.url ?? "").pathname).toContain(`/orgs/${t.id}/sha256/`);

    const early = await h.call("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key });
    expect(early.status).toBe(409);
    expect(await isQueued(run.id)).toBe(false);

    await uploadAll(uploads, [v1, v2, traffic]);
    const done = await h.call<RunView>("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key });
    expect(done.body).toMatchObject({ id: run.id, status: "queued" });
    expect(await isQueued(run.id)).toBe(true);
    const stored = await h.db.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.options).toEqual({
      base: { name: "v1.yaml" },
      head: { name: "v2-breaking.yaml" },
      traffic: { name: "traffic.jsonl", format: "jsonl" },
      failOn: "risky",
      seed: 7,
    });

    // Completing again does not queue it twice or change it.
    expect((await h.call<RunView>("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key })).body.status).toBe(
      "queued"
    );
    const events = await h.redis.xrange(`drift:run:${run.id}:events`, "-", "+");
    expect(events.map(([, fields]) => JSON.parse(fields[1] ?? "{}") as { type: string })).toEqual([
      expect.objectContaining({ type: "run.queued" }),
    ]);
  });

  it("queues at once when the organisation already has every input, and only there", async () => {
    const t = await setup();
    const first = await createRun(t, {});
    await uploadAll(first.body.uploads, [v1, v2]);
    await h.call("POST", `/api/v1/runs/${first.body.run.id}/complete`, { key: t.key });

    const second = await createRun(t, {});
    expect(second.body.uploads).toEqual([]);
    expect(second.body.run.status).toBe("queued");
    expect(await isQueued(second.body.run.id)).toBe(true);

    // Another organisation's copy of the same file does not count: its storage is its own.
    const other = await setup();
    const elsewhere = await createRun(other, {});
    expect(elsewhere.body.run.status).toBe("uploading");
    expect(elsewhere.body.uploads).toHaveLength(2);
  });

  it("is idempotent, validates its input, and needs runs:write", async () => {
    const t = await setup();
    const key = h.unique("idem");
    const first = await createRun(t, {}, key);
    const again = await createRun(t, {}, key);
    expect(again.status).toBe(200);
    expect(again.body.run.id).toBe(first.body.run.id);
    expect((await createRun(t, { seed: 1 }, key)).status).toBe(409);

    const bad = await h.call("POST", `/api/v1/projects/${t.project}/runs`, {
      key: t.key,
      headers: { "idempotency-key": h.unique("idem") },
      body: { commit: COMMIT, base: { ...described(v1), name: "../etc/passwd" }, head: described(v2) },
      valid: false,
    });
    expect(bad.status).toBe(400);
    const noKey = await h.call("POST", `/api/v1/projects/${t.project}/runs`, {
      key: t.key,
      body: { commit: COMMIT, base: described(v1), head: described(v2) },
      valid: false,
    });
    expect(noKey.status).toBe(400);
    const badPolicy = await createRun(t, { policy: { format: "nope" } });
    expect(badPolicy.status).toBe(400);

    const reader = await setup(["runs:read"]);
    expect((await createRun(reader, {})).status).toBe(403);
    expect((await createRun({ ...t, project: "no-such-project" }, {})).status).toBe(404);
  });
});

describe("re-runs", () => {
  async function serverRun(t: Setup) {
    const created = await createRun(t, {});
    await uploadAll(created.body.uploads, [v1, v2]);
    await h.call("POST", `/api/v1/runs/${created.body.run.id}/complete`, { key: t.key });
    return created.body.run;
  }

  it("creates a child run that keeps the contracts and takes the new corpus", async () => {
    const t = await setup();
    const parent = await serverRun(t);
    const child = await h.call<Created>("POST", `/api/v1/runs/${parent.id}/rerun`, {
      key: t.key,
      body: { traffic: { ...described(traffic), format: "jsonl" }, failOn: "risky" },
    });
    expect(child.status).toBe(201);
    expect(child.body.run).toMatchObject({ parentRunId: parent.id, status: "uploading", mode: "server" });
    // Only the new file is uploaded; the contracts are already stored.
    expect(child.body.uploads.map((upload) => upload.kind)).toEqual(["input-traffic"]);
    await uploadAll(child.body.uploads, [traffic]);
    const done = await h.call<RunView>("POST", `/api/v1/runs/${child.body.run.id}/complete`, { key: t.key });
    expect(done.body.status).toBe("queued");
    expect((await h.db.run.findUniqueOrThrow({ where: { id: child.body.run.id } })).options).toEqual({
      base: { name: "v1.yaml" },
      head: { name: "v2-breaking.yaml" },
      traffic: { name: "traffic.jsonl", format: "jsonl" },
      failOn: "risky",
    });

    // A re-run of the child without traffic needs no upload and is queued at once.
    const plain = await h.call<Created>("POST", `/api/v1/runs/${child.body.run.id}/rerun`, {
      key: t.key,
      body: { traffic: null },
    });
    expect(plain.body.run).toMatchObject({ parentRunId: child.body.run.id, status: "queued" });
    expect(plain.body.uploads).toEqual([]);
    const options = (await h.db.run.findUniqueOrThrow({ where: { id: plain.body.run.id } })).options;
    expect(options).not.toHaveProperty("traffic");
    expect(options).toMatchObject({ failOn: "risky" });
  });

  it("takes a new ruleset (a large body), keeps it for later re-runs, and refuses an invalid one", async () => {
    const t = await setup();
    const parent = await serverRun(t);
    const rules = { ...DEFAULT_RULESET, version: "2.0.0" };
    const child = await h.call<Created>("POST", `/api/v1/runs/${parent.id}/rerun`, { key: t.key, body: { rules } });
    expect(child.status).toBe(201);
    expect(child.body.run.status).toBe("queued");
    const stored = (await h.db.run.findUniqueOrThrow({ where: { id: child.body.run.id } })).options as {
      rules: { version: string };
    };
    expect(stored.rules.version).toBe("2.0.0");
    const grandchild = await h.call<Created>("POST", `/api/v1/runs/${child.body.run.id}/rerun`, {
      key: t.key,
      body: { seed: 4 },
    });
    expect(
      ((await h.db.run.findUniqueOrThrow({ where: { id: grandchild.body.run.id } })).options as typeof stored).rules
        .version
    ).toBe("2.0.0");

    const bad = await h.call<{ detail: string }>("POST", `/api/v1/runs/${parent.id}/rerun`, {
      key: t.key,
      body: { rules: { ...DEFAULT_RULESET, rules: DEFAULT_RULESET.rules.slice(1) } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toMatch(/^rules\.rules: No rule for: /);
    const huge = await h.call("POST", `/api/v1/runs/${parent.id}/rerun`, {
      key: t.key,
      body: { policy: { format: "drift-policy/v1", escalate: [{ kind: "x", reason: "y".repeat(600 * 1024) }] } },
      valid: false,
    });
    expect(huge.status).toBe(413);
  });

  it("refuses an uploaded run, another organisation's run, and callers without runs:write", async () => {
    const t = await setup();
    const parent = await serverRun(t);
    const uploaded = await h.call<Created>("POST", "/api/v1/runs", {
      key: t.key,
      headers: { "idempotency-key": h.unique("idem") },
      body: {
        project: t.project,
        trigger: "ci",
        commit: COMMIT,
        report: JSON.parse(await readFile(new URL("petstore/expected.json", examples), "utf8")) as unknown,
      },
    });
    expect((await h.call("POST", `/api/v1/runs/${uploaded.body.run.id}/rerun`, { key: t.key, body: {} })).status).toBe(
      409
    );
    const other = await setup();
    expect((await h.call("POST", `/api/v1/runs/${parent.id}/rerun`, { key: other.key, body: {} })).status).toBe(404);
    const reader = await h.call<{ key: string }>("POST", `/api/v1/orgs/${t.slug}/keys`, {
      user: t.owner,
      body: { name: "read", permissions: ["runs:read"] },
    });
    expect((await h.call("POST", `/api/v1/runs/${parent.id}/rerun`, { key: reader.body.key, body: {} })).status).toBe(
      403
    );
  });
});

describe("stages", () => {
  it("lists each stage's latest attempt in pipeline order, for the run's organisation only", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    const at = new Date("2026-10-03T10:00:00Z");
    const row = (stage: string, attempt: number, status: "SUCCEEDED" | "FAILED" | "RUNNING", cacheHit = false) => ({
      id: newId("stage"),
      orgId: t.id,
      runId: run.id,
      stage,
      attempt,
      status,
      cacheKey: "k",
      cacheHit,
      startedAt: at,
      ...(status === "RUNNING" ? {} : { finishedAt: at }),
    });
    await h.db.stageExecution.createMany({
      data: [
        row("diff", 2, "RUNNING"),
        row("ingest.head", 1, "FAILED"),
        row("ingest.base", 1, "SUCCEEDED"),
        row("ingest.base", 2, "SUCCEEDED", true),
        row("ingest.head", 2, "SUCCEEDED", true),
      ],
    });
    const listed = await h.call<{ stages: StageView[] }>("GET", `/api/v1/runs/${run.id}/stages`, { key: t.key });
    expect(listed.body.stages.map((stage) => [stage.stage, stage.attempt, stage.status, stage.cacheHit])).toEqual([
      ["ingest.base", 2, "succeeded", true],
      ["ingest.head", 2, "succeeded", true],
      ["diff", 2, "running", false],
    ]);
    expect(listed.body.stages[2]).not.toHaveProperty("finishedAt");

    const other = await setup();
    expect((await h.call("GET", `/api/v1/runs/${run.id}/stages`, { key: other.key })).status).toBe(404);
  });
});

interface Frame {
  id?: string;
  event?: string;
  data?: RunEvent;
  comment?: string;
}

/**
 * Opens the run's event stream through the same dispatcher the route uses and reads frames until the server closes
 * the stream, `stop` says so, or `timeoutMs` passes.
 */
async function stream(
  runId: string,
  options: { key: string; lastEventId?: string; stop?: (frames: Frame[]) => boolean; timeoutMs?: number }
): Promise<{ status: number; contentType: string | null; frames: Frame[]; closedByServer: boolean }> {
  const abort = new AbortController();
  const response = await dispatch(
    h.api,
    new Request(`http://drift.test/api/v1/runs/${runId}/events`, {
      headers: {
        authorization: `Bearer ${options.key}`,
        ...(options.lastEventId === undefined ? {} : { "last-event-id": options.lastEventId }),
      },
      signal: abort.signal,
    })
  );
  const frames: Frame[] = [];
  let closedByServer = false;
  if (response.body && response.headers.get("content-type")?.startsWith("text/event-stream")) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const timer = setTimeout(() => void reader.cancel(), options.timeoutMs ?? 5000);
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        closedByServer = !abort.signal.aborted;
        break;
      }
      buffer += value;
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const frame: Frame = {};
        for (const line of buffer.slice(0, end).split("\n")) {
          if (line.startsWith(":")) frame.comment = line.slice(1).trim();
          else if (line.startsWith("id: ")) frame.id = line.slice(4);
          else if (line.startsWith("event: ")) frame.event = line.slice(7);
          else if (line.startsWith("data: ")) frame.data = JSON.parse(line.slice(6)) as RunEvent;
        }
        frames.push(frame);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
      if (options.stop?.(frames)) {
        abort.abort();
        await reader.cancel();
        break;
      }
    }
    clearTimeout(timer);
  }
  return { status: response.status, contentType: response.headers.get("content-type"), frames, closedByServer };
}

const at = "2026-10-03T10:00:00.000Z";
const completed: RunEvent = {
  type: "run.completed",
  at,
  gate: { passed: false, failOn: "breaking" },
  summary: { breaking: 2, risky: 1, safe: 3, suppressed: 0 },
  semver: "major",
};
const events = (frames: Frame[]) => frames.filter((frame) => frame.data).map((frame) => frame.data?.type);

describe("run events (SSE)", () => {
  it("replays the history, then streams live events, and ends after the final one", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    await publishRunEvent(h.redis, run.id, { type: "run.queued", at });
    await publishRunEvent(h.redis, run.id, { type: "run.started", at, attempt: 1 });

    const reading = stream(run.id, { key: t.key });
    // Live events published while the client is connected.
    setTimeout(() => {
      void (async () => {
        await publishRunEvent(h.redis, run.id, { type: "stage.started", at, attempt: 1, stage: "diff" });
        await publishRunEvent(h.redis, run.id, completed);
      })();
    }, 300);
    const result = await reading;
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/event-stream; charset=utf-8");
    expect(events(result.frames)).toEqual(["run.queued", "run.started", "stage.started", "run.completed"]);
    expect(
      result.frames.filter((frame) => frame.data).every((frame) => frame.id && frame.event === frame.data?.type)
    ).toBe(true);
    expect(result.closedByServer).toBe(true);
  });

  it("with Last-Event-ID, replays only the events after it; an id that is not one is ignored", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    const first = await publishRunEvent(h.redis, run.id, { type: "run.queued", at });
    await publishRunEvent(h.redis, run.id, { type: "run.started", at, attempt: 1 });
    await publishRunEvent(h.redis, run.id, completed);

    const resumed = await stream(run.id, { key: t.key, lastEventId: first.id });
    expect(events(resumed.frames)).toEqual(["run.started", "run.completed"]);
    expect(resumed.closedByServer).toBe(true);

    const garbage = await stream(run.id, { key: t.key, lastEventId: "0); FLUSHALL" });
    expect(events(garbage.frames)).toEqual(["run.queued", "run.started", "run.completed"]);
  });

  it("after the run ended: the final event from the database when the history expired, nothing if already seen", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    await h.db.run.update({
      where: { id: run.id },
      data: {
        status: "COMPLETE",
        completedAt: new Date(at),
        gatePassed: false,
        failOn: "breaking",
        breaking: 2,
        risky: 1,
        safe: 3,
        suppressed: 0,
        semver: "major",
      },
    });
    const expired = await stream(run.id, { key: t.key });
    expect(expired.frames).toEqual([{ event: "run.completed", data: completed }]);
    expect(expired.closedByServer).toBe(true);

    const final = await publishRunEvent(h.redis, run.id, completed);
    const seen = await stream(run.id, { key: t.key, lastEventId: final.id });
    expect(seen.frames).toEqual([]);
    expect(seen.closedByServer).toBe(true);

    const failed = (await createRun(t, {})).body.run;
    await h.db.run.update({
      where: { id: failed.id },
      data: { status: "FAILED", errorCategory: "timeout", errorMessage: "Too slow." },
    });
    expect(events((await stream(failed.id, { key: t.key })).frames)).toEqual(["run.failed"]);
  });

  it("keeps an idle stream alive with comments, and is closed by the client", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    const result = await stream(run.id, { key: t.key, stop: (frames) => frames.some((frame) => frame.comment) });
    expect(result.frames).toEqual([{ comment: "keep-alive" }]);
    expect(result.closedByServer).toBe(false);
  });

  it("needs credentials and the run's organisation", async () => {
    const t = await setup();
    const run = (await createRun(t, {})).body.run;
    const other = await setup();
    expect((await stream(run.id, { key: other.key })).status).toBe(404);
    expect((await stream(run.id, { key: "drift_live_nope" })).status).toBe(401);
  });
});
