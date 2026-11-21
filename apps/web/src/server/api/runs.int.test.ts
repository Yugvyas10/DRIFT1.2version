import { createHash } from "node:crypto";
import type { Report } from "@drift/report-schema";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_RUN_BODY_BYTES, type RunView, type UploadView } from "../services/runs";
import { harness } from "../testing/harness";
import { petstoreReport } from "../testing/report";

const h = harness();
let report: Report;
beforeAll(async () => {
  report = await petstoreReport();
});

interface Created {
  run: RunView;
  uploads: UploadView[];
}
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const COMMIT = "a".repeat(40);

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

function artifact(kind: string, content: string, contentType = "application/json") {
  return { kind, sha256: sha256(content), size: Buffer.byteLength(content), contentType };
}

const upload = (url: string, content: string, contentType = "application/json") =>
  fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: content });

describe("uploading a run", () => {
  it("creates the run from the report, takes the artifacts through pre-signed URLs, and completes it", async () => {
    const t = await setup();
    const json = JSON.stringify(report);
    const body = {
      project: t.project,
      trigger: "ci",
      commit: COMMIT,
      branch: "main",
      pullRequest: 7,
      report,
      artifacts: [artifact("report-json", json)],
    };
    const created = await h.call<Created>("POST", "/api/v1/runs", {
      key: t.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body,
    });
    expect(created.status).toBe(201);
    const { run, uploads } = created.body;
    expect(run).toMatchObject({
      project: t.project,
      status: "uploading",
      trigger: "ci",
      commit: COMMIT,
      branch: "main",
      pullRequest: 7,
      gate: report.gate,
      summary: report.summary,
      semver: report.semver,
    });
    expect(uploads).toHaveLength(1);
    // The object lives under the organisation's own prefix, by content hash.
    expect(new URL(uploads[0]?.url ?? "").pathname).toContain(`/orgs/${t.id}/sha256/${sha256(json)}`);

    // Completing before the upload is refused; the server looks in storage itself.
    const early = await h.call("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key });
    expect(early).toMatchObject({ status: 409, body: { detail: "report-json: not uploaded" } });
    expect((await h.call("GET", `/api/v1/runs/${run.id}/artifacts/report-json`, { key: t.key })).status).toBe(404);

    expect((await upload(uploads[0]?.url ?? "", json)).status).toBe(200);
    const done = await h.call<RunView>("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key });
    expect(done.body).toMatchObject({ id: run.id, status: "complete" });
    expect(done.body.completedAt).toBeDefined();
    // Completing again is harmless.
    expect((await h.call<RunView>("POST", `/api/v1/runs/${run.id}/complete`, { key: t.key })).body.status).toBe(
      "complete"
    );

    // The artifact is read back through a short-lived signed URL.
    const link = await h.call<{ url: string; expiresAt: string }>(
      "GET",
      `/api/v1/runs/${run.id}/artifacts/report-json`,
      { key: t.key }
    );
    expect(await (await fetch(link.body.url)).json()).toEqual(report);
    expect(new Date(link.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect((await fetch(link.body.url.replace(/X-Amz-Signature=[0-9a-f]+/, "X-Amz-Signature=0"))).status).toBe(403);

    // Stage rows, changes and evidence summaries come from the report.
    const stored = await h.db.run.findUniqueOrThrow({
      where: { id: run.id },
      include: { stages: true, changes: { include: { evidence: true } }, artifacts: true },
    });
    expect(stored.stages.map((s) => s.stage).sort()).toEqual(report.stages.map((s) => s.stage).sort());
    expect(stored.changes).toHaveLength(report.changes.length);
    expect(stored.changes.filter((c) => c.severity === "BREAKING")).toHaveLength(report.summary.breaking);
    expect(stored.changes.every((c) => c.orgId === t.id && c.evidence?.artifactId === stored.artifacts[0]?.id)).toBe(
      true
    );
    expect(stored.headSpecHash).toBe(report.head.specHash);
  });

  it("is idempotent: the same key and body return the same run, a different body is a conflict", async () => {
    const t = await setup();
    const headers = { "idempotency-key": h.unique("idem-key") };
    const body = { project: t.project, trigger: "ci", commit: COMMIT, report };
    const first = await h.call<Created>("POST", "/api/v1/runs", { key: t.key, headers, body });
    const second = await h.call<Created>("POST", "/api/v1/runs", { key: t.key, headers, body });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.run).toEqual(first.body.run);
    expect(first.body.run.status).toBe("complete"); // no artifacts announced, so nothing to wait for
    expect(await h.db.run.count({ where: { orgId: t.id } })).toBe(1);

    const different = await h.call("POST", "/api/v1/runs", {
      key: t.key,
      headers,
      body: { ...body, commit: "b".repeat(40) },
    });
    expect(different.status).toBe(409);
    // Two identical requests at once still make one run.
    const racing = { "idempotency-key": h.unique("idem-key") };
    const replies = await Promise.all(
      [1, 2, 3].map(() => h.call<Created>("POST", "/api/v1/runs", { key: t.key, headers: racing, body }))
    );
    expect(new Set(replies.map((r) => r.body.run.id)).size).toBe(1);
    expect(replies.map((r) => r.status).sort()).toContain(201);
  });

  it("reuses an artifact the organisation already stored, and never another organisation's", async () => {
    const [a, b] = await Promise.all([setup(), setup()]);
    const md = "# report";
    const body = (project: string) => ({
      project,
      trigger: "ci",
      commit: COMMIT,
      report,
      artifacts: [artifact("report-md", md, "text/markdown")],
    });
    const first = await h.call<Created>("POST", "/api/v1/runs", {
      key: a.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body: body(a.project),
    });
    await upload(first.body.uploads[0]?.url ?? "", md, "text/markdown");
    await h.call("POST", `/api/v1/runs/${first.body.run.id}/complete`, { key: a.key });

    const again = await h.call<Created>("POST", "/api/v1/runs", {
      key: a.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body: body(a.project),
    });
    expect(again.body).toMatchObject({ uploads: [], run: { status: "complete" } });
    const other = await h.call<Created>("POST", "/api/v1/runs", {
      key: b.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body: body(b.project),
    });
    expect(other.body.uploads).toHaveLength(1);
    expect(other.body.run.status).toBe("uploading");
  });

  it("refuses an upload whose content is not what was announced", async () => {
    const t = await setup();
    const body = {
      project: t.project,
      trigger: "ci",
      commit: COMMIT,
      report,
      artifacts: [artifact("report-html", "<p>announced</p>", "text/html")],
    };
    const created = await h.call<Created>("POST", "/api/v1/runs", {
      key: t.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body,
    });
    await upload(created.body.uploads[0]?.url ?? "", "<p>something else</p>", "text/html");
    const done = await h.call("POST", `/api/v1/runs/${created.body.run.id}/complete`, { key: t.key });
    expect(done).toMatchObject({
      status: 409,
      body: { detail: "report-html: does not match the announced size and SHA-256" },
    });
    expect((await h.call<RunView>("GET", `/api/v1/runs/${created.body.run.id}`, { key: t.key })).body.status).toBe(
      "uploading"
    );
  });

  it("rejects invalid, oversize and malformed requests (PLAN M5)", async () => {
    const t = await setup();
    const send = (
      body: unknown,
      headers: Record<string, string> = { "idempotency-key": h.unique("idem-key") },
      raw?: string
    ) =>
      h.call<{ detail?: string }>("POST", "/api/v1/runs", {
        key: t.key,
        headers,
        valid: false,
        ...(raw === undefined ? { body } : { raw }),
      });
    const base = { project: t.project, trigger: "ci", commit: COMMIT };

    // Not a drift-report/v1 document: 422, naming the fields.
    const invalid = await send({ ...base, report: { ...report, summary: { breaking: -1 } } });
    expect(invalid.status).toBe(422);
    expect(invalid.body.detail).toContain("summary");
    expect((await send({ ...base, report: { format: "drift-report/v2" } })).status).toBe(422);

    // Over the body limit: refused by the declared length, before anything is parsed.
    const big = JSON.stringify({ ...base, report, padding: "x".repeat(MAX_RUN_BODY_BYTES) });
    const oversize = await send(
      undefined,
      { "idempotency-key": h.unique("idem-key"), "content-length": String(Buffer.byteLength(big)) },
      big
    );
    expect(oversize.status).toBe(413);

    expect((await send({ ...base, report }, {})).status).toBe(400); // no Idempotency-Key
    expect((await send({ ...base, report }, { "idempotency-key": "short" })).status).toBe(400);
    expect((await send({ ...base, commit: "not-a-sha", report })).status).toBe(400);
    expect((await send({ ...base, report, extra: true })).status).toBe(400);
    expect(
      (await send({ ...base, report, artifacts: [artifact("report-md", "a"), artifact("report-md", "b")] })).status
    ).toBe(400);
    expect((await send({ ...base, project: "no-such-project", report })).status).toBe(404);
    expect(await h.db.run.count({ where: { orgId: t.id } })).toBe(0);
  });
});

describe("reading runs", () => {
  it("lists a project's runs newest first, in pages", async () => {
    const t = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await h.call<Created>("POST", "/api/v1/runs", {
        key: t.key,
        headers: { "idempotency-key": h.unique("idem-key") },
        body: { project: t.project, trigger: "ci", commit: String(i).repeat(40), report },
      });
      ids.unshift(created.body.run.id);
    }
    const page = (query: string) =>
      h.call<{ runs: RunView[]; nextCursor?: string }>("GET", `/api/v1/projects/${t.project}/runs${query}`, {
        key: t.key,
      });
    const first = await page("?limit=2");
    expect(first.body.runs.map((r) => r.id)).toEqual(ids.slice(0, 2));
    const second = await page(`?limit=2&cursor=${first.body.nextCursor ?? ""}`);
    expect(second.body.runs.map((r) => r.id)).toEqual(ids.slice(2, 4));
    const third = await page(`?limit=2&cursor=${second.body.nextCursor ?? ""}`);
    expect(third.body.runs.map((r) => r.id)).toEqual(ids.slice(4));
    expect(third.body.nextCursor).toBeUndefined();
    expect((await page("")).body.runs).toHaveLength(5);
    expect(
      (await h.call("GET", `/api/v1/projects/${t.project}/runs?cursor=garbage`, { key: t.key, valid: false })).status
    ).toBe(400);
    expect(
      (await h.call("GET", `/api/v1/projects/${t.project}/runs?limit=abc`, { key: t.key, valid: false })).status
    ).toBe(400);
  });

  it("is open to members through their session, and closed to everyone else (404)", async () => {
    const [t, other] = await Promise.all([setup(), setup()]);
    const created = await h.call<Created>("POST", "/api/v1/runs", {
      key: t.key,
      headers: { "idempotency-key": h.unique("idem-key") },
      body: { project: t.project, trigger: "ci", commit: COMMIT, report },
    });
    const id = created.body.run.id;
    const viewer = await h.user();
    await h.join(t.id, viewer.id, "VIEWER");

    expect((await h.call<RunView>("GET", `/api/v1/runs/${id}`, { user: viewer })).body.id).toBe(id);
    expect((await h.call("GET", `/api/v1/projects/${t.project}/runs`, { user: viewer })).status).toBe(200);
    expect((await h.call("GET", `/api/v1/projects/${t.project}/runs?org=${t.slug}`, { user: viewer })).status).toBe(
      200
    );
    // A viewer reads but does not write.
    expect((await h.call("POST", `/api/v1/runs/${id}/complete`, { user: viewer })).status).toBe(403);

    // Another organisation's key or member: the run does not exist for them.
    expect((await h.call("GET", `/api/v1/runs/${id}`, { key: other.key })).status).toBe(404);
    expect((await h.call("POST", `/api/v1/runs/${id}/complete`, { key: other.key })).status).toBe(404);
    expect((await h.call("GET", `/api/v1/runs/${id}/artifacts/report-json`, { user: other.owner })).status).toBe(404);
    expect(
      (await h.call("GET", `/api/v1/projects/${t.project}/runs?org=${t.slug}`, { user: other.owner })).status
    ).toBe(404);
    expect((await h.call("GET", "/api/v1/runs/run_000000000000000000000000", { key: t.key })).status).toBe(404);
    expect((await h.call("GET", `/api/v1/runs/${id}`)).status).toBe(401);
  });

  it("asks a user in several organisations which one they mean", async () => {
    const [a, b] = await Promise.all([setup(), setup()]);
    await h.join(b.id, a.owner.id, "MEMBER");
    expect((await h.call("GET", `/api/v1/projects/${a.project}/runs`, { user: a.owner, valid: false })).status).toBe(
      400
    );
    expect((await h.call("GET", `/api/v1/projects/${a.project}/runs?org=${a.slug}`, { user: a.owner })).status).toBe(
      200
    );
    // A member (not only a key) can create a run, naming the organisation.
    const manual = await h.call<Created>("POST", `/api/v1/runs?org=${b.slug}`, {
      user: a.owner,
      headers: { "idempotency-key": h.unique("idem-key") },
      body: { project: b.project, trigger: "manual", commit: COMMIT, report },
    });
    expect(manual.body.run).toMatchObject({ project: b.project, trigger: "manual" });
  });
});
