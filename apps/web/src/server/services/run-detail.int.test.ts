import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Report } from "@drift/report-schema";
import { beforeAll, describe, expect, it } from "vitest";
import type { Permission } from "../auth/permissions";
import { authorize } from "../auth/require-auth";
import { HttpError } from "../http";
import { harness } from "../testing/harness";
import { petstoreReport } from "../testing/report";
import { deleteProjectPolicy, getProjectPolicy, setProjectPolicy } from "./policies";
import { listArtifacts, loadContracts, loadReport, locateChanges } from "./run-detail";
import { latestRuns, type RunView, type UploadView } from "./runs";
import { deleteSuppression } from "./suppressions";

const h = harness();
const examples = new URL("../../../../../examples/petstore/", import.meta.url);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
let report: Report;
let v1: string;
let v2: string;

beforeAll(async () => {
  report = await petstoreReport();
  v1 = await readFile(new URL("v1.yaml", examples), "utf8");
  v2 = await readFile(new URL("v2-breaking.yaml", examples), "utf8");
});

async function setup() {
  const org = await h.org();
  const project = h.unique("api");
  await h.call("POST", `/api/v1/orgs/${org.slug}/projects`, { user: org.owner, body: { name: "API", slug: project } });
  const key = (
    await h.call<{ key: string }>("POST", `/api/v1/orgs/${org.slug}/keys`, {
      user: org.owner,
      body: { name: "CI", permissions: ["runs:read", "runs:write"] },
    })
  ).body.key;
  const actor = (permission: Permission = "runs:read", userId = org.owner.id) =>
    authorize({ kind: "user", userId }, { slug: org.slug }, permission, { db: h.db });
  return { ...org, project, key, actor };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** An uploaded, complete run with the petstore report. */
async function uploadedRun(t: Setup, branch = "main"): Promise<RunView> {
  const json = JSON.stringify(report);
  const created = await h.call<{ run: RunView; uploads: UploadView[] }>("POST", "/api/v1/runs", {
    key: t.key,
    headers: { "idempotency-key": h.unique("idem") },
    body: {
      project: t.project,
      trigger: "ci",
      commit: "a".repeat(40),
      branch,
      report,
      artifacts: [
        { kind: "report-json", sha256: sha256(json), size: Buffer.byteLength(json), contentType: "application/json" },
      ],
    },
  });
  for (const upload of created.body.uploads) {
    await fetch(upload.url, { method: "PUT", headers: { "content-type": "application/json" }, body: json });
  }
  return (await h.call<RunView>("POST", `/api/v1/runs/${created.body.run.id}/complete`, { key: t.key })).body;
}

/** A server-side run with its contracts in storage (queued: no worker runs in these tests). */
async function serverRun(t: Setup): Promise<RunView> {
  const file = (name: string, text: string) => ({ name, sha256: sha256(text), size: Buffer.byteLength(text) });
  const created = await h.call<{ run: RunView; uploads: UploadView[] }>("POST", `/api/v1/projects/${t.project}/runs`, {
    key: t.key,
    headers: { "idempotency-key": h.unique("idem") },
    body: { commit: "b".repeat(40), base: file("v1.yaml", v1), head: file("v2-breaking.yaml", v2) },
  });
  for (const upload of created.body.uploads) {
    const text = upload.sha256 === sha256(v1) ? v1 : v2;
    await fetch(upload.url, { method: "PUT", headers: { "content-type": "application/yaml" }, body: text });
  }
  return (await h.call<RunView>("POST", `/api/v1/runs/${created.body.run.id}/complete`, { key: t.key })).body;
}

describe("run list filters", () => {
  it("narrow by status, gate, mode and branch, and refuse unknown values", async () => {
    const t = await setup();
    await uploadedRun(t, "main");
    await uploadedRun(t, "feature");
    const queued = await serverRun(t);
    const list = async (query: string) =>
      (await h.call<{ runs: RunView[] }>("GET", `/api/v1/projects/${t.project}/runs?${query}`, { key: t.key })).body
        .runs;
    expect((await list("")).length).toBe(3);
    expect((await list("mode=server")).map((run) => run.id)).toEqual([queued.id]);
    expect((await list("status=complete")).length).toBe(2);
    expect((await list("gate=failed")).length).toBe(2);
    expect(await list("gate=passed")).toEqual([]);
    expect((await list("branch=feature&mode=upload")).map((run) => run.branch)).toEqual(["feature"]);
    const bad = await h.call("GET", `/api/v1/projects/${t.project}/runs?status=done`, { key: t.key, valid: false });
    expect(bad.status).toBe(400);
  });

  it("the overview shows each project's newest run", async () => {
    const t = await setup();
    await uploadedRun(t);
    const newest = await serverRun(t);
    const latest = await latestRuns(h.db, await t.actor());
    expect(latest.get(t.project)?.id).toBe(newest.id);
  });
});

describe("run detail", () => {
  it("loads the stored report and files of a run, for its organisation only", async () => {
    const t = await setup();
    const run = await uploadedRun(t);
    const actor = await t.actor();
    expect(await loadReport(h.db, h.store, actor, run.id)).toEqual(report);
    expect((await listArtifacts(h.db, actor, run.id)).map((artifact) => artifact.kind)).toEqual(["report-json"]);
    expect(await loadContracts(h.db, h.store, actor, run.id)).toEqual({ available: false, reason: "uploaded" });

    const queued = await serverRun(t);
    expect(await loadReport(h.db, h.store, actor, queued.id)).toBeUndefined();

    const other = await setup();
    await expect(loadReport(h.db, h.store, await other.actor(), run.id)).rejects.toMatchObject({ status: 404 });
  });

  it("locates every change in both stored contracts, for the side-by-side diff", async () => {
    const t = await setup();
    const run = await serverRun(t);
    const contracts = await loadContracts(h.db, h.store, await t.actor(), run.id);
    if (!contracts.available) throw new Error("the contracts should be stored");
    expect(contracts).toEqual({ available: true, base: v1, head: v2 });
    const lines = await locateChanges(report, contracts);
    expect(lines.size).toBe(report.changes.length);
    // Every change is somewhere: in the old contract, the new one, or both.
    for (const change of report.changes) {
      const at = lines.get(change.id) ?? {};
      expect(at.base ?? at.head, change.message).toBeDefined();
      if (change.position) expect(change.side === "head" ? at.head : at.base).toBe(change.position.line);
    }
  });
});

describe("project policy", () => {
  it("is set from YAML, validated, audited, used for runs without their own, and removable", async () => {
    const t = await setup();
    const admin = await t.actor("projects:write");
    expect(await getProjectPolicy(h.db, admin, t.project)).toBeUndefined();
    const saved = await setProjectPolicy(
      h.db,
      admin,
      t.project,
      "format: drift-policy/v1\nfailOn: risky\nescalate:\n  - kind: operation.deprecated\n    reason: Deprecations need a plan.\n"
    );
    expect(saved.document).toMatchObject({ format: "drift-policy/v1", failOn: "risky" });
    expect(saved.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await getProjectPolicy(h.db, admin, t.project)).toEqual(saved);

    for (const [text, detail] of [
      ["format: [", /^policy: line 1:/],
      ["format: drift-policy/v2\n", /^policy\.format:/],
      [
        "format: drift-policy/v1\nsuppressions:\n  - changeId: 0123456789abcdef\n    reason: short\n    expiresAt: 2027-01-01\n",
        /reason/,
      ],
      [`format: drift-policy/v1\n# ${"x".repeat(64 * 1024)}\n`, /^policy: at most 64 KiB$/],
    ] as const) {
      const refused = await setProjectPolicy(h.db, admin, t.project, text).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(HttpError);
      expect((refused as HttpError).detail).toMatch(detail);
    }

    const member = await h.user();
    await h.join(t.id, member.id, "MEMBER");
    await expect(
      setProjectPolicy(h.db, await t.actor("projects:read", member.id), t.project, "format: drift-policy/v1\n")
    ).rejects.toMatchObject({ status: 403 });

    await deleteProjectPolicy(h.db, admin, t.project);
    expect(await getProjectPolicy(h.db, admin, t.project)).toBeUndefined();
    const actions = (await h.db.auditLog.findMany({ where: { orgId: t.id } })).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["policy.update", "policy.delete"]));
  });
});

describe("suppressions", () => {
  it("can be removed by a member who may suppress (audited), once", async () => {
    const t = await setup();
    const created = await h.call<{ suppression: { id: string } }>(
      "POST",
      `/api/v1/orgs/${t.slug}/projects/${t.project}/suppressions`,
      {
        user: t.owner,
        body: {
          changeId: "0123456789abcdef",
          reason: "Accepted: clients migrated.",
          expiresAt: "2027-01-01T00:00:00Z",
        },
      }
    );
    const id = created.body.suppression.id;
    const viewer = await h.user();
    await h.join(t.id, viewer.id, "VIEWER");
    await expect(
      deleteSuppression(h.db, await t.actor("projects:read", viewer.id), t.project, id)
    ).rejects.toMatchObject({ status: 403 });

    const owner = await t.actor("suppressions:write");
    await deleteSuppression(h.db, owner, t.project, id);
    expect(await h.db.suppression.count({ where: { id } })).toBe(0);
    await expect(deleteSuppression(h.db, owner, t.project, id)).rejects.toMatchObject({ status: 404 });
    expect(await h.db.auditLog.count({ where: { orgId: t.id, action: "suppression.delete" } })).toBe(1);
  });
});
