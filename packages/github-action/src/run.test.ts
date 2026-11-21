import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { MARKDOWN_MARKER } from "@drift/core";
import { describe, expect, it } from "vitest";
import { ACTIONS_BOT, keyMarker, type GitHubApi } from "./comment.ts";
import { systemGit, type Git } from "./git.ts";
import { parseInputs } from "./inputs.ts";
import { runAction, type ActionDeps, type EventContext } from "./run.ts";

const petstore = fileURLToPath(new URL("../../../examples/petstore/", import.meta.url));

/** A repository whose first commit holds petstore v1 as openapi.yaml, with `head` in the working tree. */
function repository(head: string) {
  const dir = mkdtempSync(join(tmpdir(), "drift-action-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  copyFileSync(`${petstore}v1.yaml`, join(dir, "openapi.yaml"));
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  copyFileSync(`${petstore}${head}`, join(dir, "openapi.yaml"));
  return { dir, base };
}

function fakeGitHub(options: { failComment?: boolean; failSarif?: boolean } = {}) {
  const calls: { kind: string; body?: string; sarif?: string; commitSha?: string; ref?: string }[] = [];
  const api: GitHubApi = {
    login: () => Promise.resolve(undefined),
    listComments: () =>
      Promise.resolve(
        calls.filter((c) => c.kind === "create").map((c, i) => ({ id: i + 1, body: c.body, login: ACTIONS_BOT }))
      ),
    createComment: (_, body) => {
      if (options.failComment) return Promise.reject(new Error("Resource not accessible by integration"));
      calls.push({ kind: "create", body });
      return Promise.resolve();
    },
    updateComment: (_, body) => {
      calls.push({ kind: "update", body });
      return Promise.resolve();
    },
    uploadSarif: (upload) => {
      if (options.failSarif) return Promise.reject(new Error("Advanced Security must be enabled"));
      calls.push({ kind: "sarif", ...upload });
      return Promise.resolve();
    },
  };
  return { api, calls };
}

function harness(
  dir: string,
  event: EventContext,
  inputs: Record<string, string>,
  overrides: Partial<ActionDeps> = {}
) {
  const summaries: string[] = [];
  const outputs: Record<string, string> = {};
  const logs: string[] = [];
  const github = fakeGitHub();
  const deps: ActionDeps = {
    inputs: parseInputs((name) => inputs[name] ?? ""),
    event,
    workspace: dir,
    temp: mkdtempSync(join(tmpdir(), "drift-action-out-")),
    git: systemGit,
    github: github.api,
    log: {
      info: (m) => logs.push(`info ${m}`),
      notice: (m) => logs.push(`notice ${m}`),
      warning: (m) => logs.push(`warning ${m}`),
    },
    summary: (markdown) => {
      summaries.push(markdown);
      return Promise.resolve();
    },
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    asOf: "2026-09-30",
    ...overrides,
  };
  return { deps, summaries, outputs, logs, calls: github.calls };
}

const pr = (base: string): EventContext => ({
  eventName: "pull_request",
  sha: "f".repeat(40),
  ref: "refs/pull/7/merge",
  pullRequest: { number: 7, baseSha: base },
});

describe("runAction on a pull request", () => {
  it("fails a breaking change, with the summary, one comment, outputs and report files", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml" });
    const result = await runAction(h.deps);

    expect(result.passed).toBe(false);
    expect(result.failure).toMatch(/^DRIFT: the contract gate failed \(\d+ BREAKING, \d+ RISKY, fail-on breaking\)$/);
    expect(h.summaries).toHaveLength(1);
    expect(h.summaries[0]?.startsWith(`${MARKDOWN_MARKER}\n## ❌ DRIFT: contract gate failed`)).toBe(true);

    const [comment] = h.calls;
    expect(comment?.kind).toBe("create");
    // The PR comment shows the rule, its rationale and the failing payload (M4 acceptance).
    expect(comment?.body).toContain("Rule <code>DRIFT\\-REQ\\-");
    expect(comment?.body).toContain("Failing sample");
    expect(comment?.body?.endsWith(`${keyMarker("openapi.yaml")}\n`)).toBe(true);

    expect(h.outputs).toMatchObject({ passed: "false", semver: "major" });
    expect(Number(h.outputs.breaking)).toBeGreaterThan(0);
    expect(readdirSync(h.outputs["report-dir"] ?? "").sort()).toEqual([
      "drift-report.html",
      "drift-report.json",
      "drift-report.md",
      "drift-report.sarif",
    ]);
    const report = JSON.parse(readFileSync(join(h.outputs["report-dir"] ?? "", "drift-report.json"), "utf8")) as {
      base: { file: string };
    };
    expect(report.base.file).toBe(`${base}:openapi.yaml`);
  });

  it("updates its comment on the next run instead of adding another", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml" });
    await runAction(h.deps);
    await runAction(h.deps);
    expect(h.calls.map((call) => call.kind)).toEqual(["create", "update"]);
  });

  it("passes an additive change", async () => {
    const { dir, base } = repository("v2-additive.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml" });
    expect(await runAction(h.deps)).toEqual({ passed: true });
    expect(h.outputs).toMatchObject({ passed: "true", breaking: "0", semver: "minor" });
    expect(h.summaries[0]).toContain("## ✅ DRIFT: contract gate passed");
  });

  it("fails on RISKY with fail-on risky", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml", "fail-on": "risky", comment: "false" });
    const result = await runAction(h.deps);
    expect(result.failure).toMatch(/fail-on risky\)$/);
    expect(h.calls).toEqual([]);
  });

  it("uploads SARIF (gzip, base64) for the checked commit and ref", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml", sarif: "true", comment: "false" });
    await runAction(h.deps);
    const [upload] = h.calls;
    expect(upload).toMatchObject({ kind: "sarif", commitSha: "f".repeat(40), ref: "refs/pull/7/merge" });
    const sarif = JSON.parse(gunzipSync(Buffer.from(upload?.sarif ?? "", "base64")).toString("utf8")) as {
      version: string;
    };
    expect(sarif.version).toBe("2.1.0");
  });

  it("warns, and still gates, when the comment or the SARIF upload is refused (a fork's read-only token)", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const github = fakeGitHub({ failComment: true, failSarif: true });
    const h = harness(dir, pr(base), { spec: "openapi.yaml", sarif: "true" }, { github: github.api });
    expect((await runAction(h.deps)).passed).toBe(false);
    expect(h.logs.filter((line) => line.startsWith("warning"))).toEqual([
      expect.stringMatching(/^warning comment: could not write .*Resource not accessible.*pull-requests: write/),
      expect.stringMatching(/^warning sarif: the upload failed .*security-events: write/),
    ]);
  });

  it("warns instead of commenting or uploading without a token", async () => {
    const { dir, base } = repository("v2-additive.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml", sarif: "true" }, { github: undefined });
    await runAction(h.deps);
    expect(h.logs).toContain("warning comment: no token, so no pull-request comment (the job summary has the report)");
    expect(h.logs).toContain("warning sarif: no token, so the SARIF report was not uploaded");
  });

  it("says plainly that platform upload is not built yet, and sends nothing", async () => {
    const { dir, base } = repository("v2-additive.yaml");
    const h = harness(dir, pr(base), { spec: "openapi.yaml", upload: "true", comment: "false" });
    expect((await runAction(h.deps)).passed).toBe(true);
    expect(h.logs).toContain(
      "warning upload: not built yet. The DRIFT platform's ingestion API arrives in M5; nothing was sent anywhere."
    );
    expect(h.calls).toEqual([]);
  });
});

describe("runAction: choosing and fetching the base", () => {
  it("passes a new contract (not at the base commit), or fails it with base-missing: fail", async () => {
    const { dir, base } = repository("v2-additive.yaml");
    const passing = harness(dir, pr(base), { spec: "new-api.yaml" });
    expect(await runAction(passing.deps)).toEqual({ passed: true });
    expect(passing.summaries[0]).toContain("DRIFT: nothing to compare");
    expect(passing.logs[0]).toMatch(/^notice new-api\.yaml does not exist at the base commit/);

    const failing = harness(dir, pr(base), { spec: "new-api.yaml", "base-missing": "fail" });
    expect((await runAction(failing.deps)).failure).toMatch(/^drift: new-api\.yaml does not exist at the base commit/);
  });

  it("fetches the base commit when the checkout is shallow, and explains a failed fetch", async () => {
    const { dir, base } = repository("v2-additive.yaml");
    const fetched: string[] = [];
    const missingThenFetched: Git = {
      has: (cwd, object) =>
        object.endsWith("^{commit}") && fetched.length === 0 ? Promise.resolve(false) : systemGit.has(cwd, object),
      fetch: (_, sha) => {
        fetched.push(sha);
        return Promise.resolve();
      },
    };
    const h = harness(dir, pr(base), { spec: "openapi.yaml" }, { git: missingThenFetched });
    expect((await runAction(h.deps)).passed).toBe(true);
    expect(fetched).toEqual([base]);

    const unreachable: Git = { has: () => Promise.resolve(false), fetch: () => Promise.reject(new Error("no")) };
    const failed = harness(dir, pr(base), { spec: "openapi.yaml" }, { git: unreachable });
    await expect(runAction(failed.deps)).rejects.toThrow(/could not fetch the base commit .*fetch-depth: 0/);
  });

  it("compares with the commit before a push", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    const push: EventContext = { eventName: "push", sha: "e".repeat(40), ref: "refs/heads/main", before: base };
    const h = harness(dir, push, { spec: "openapi.yaml" });
    expect((await runAction(h.deps)).passed).toBe(false);
    expect(h.calls).toEqual([]); // no pull request, so no comment
  });

  it("asks for a base when the event has none", async () => {
    const { dir } = repository("v2-additive.yaml");
    const branch: EventContext = {
      eventName: "push",
      sha: "e".repeat(40),
      ref: "refs/heads/new",
      before: "0".repeat(40),
    };
    await expect(runAction(harness(dir, branch, { spec: "openapi.yaml" }).deps)).rejects.toThrow(
      /cannot tell which commit to compare with for a "push" event; set the input "base"/
    );
  });

  it("takes explicit base and head inputs, as files or git revisions", async () => {
    const { dir, base } = repository("v2-breaking.yaml");
    copyFileSync(`${petstore}v2-additive.yaml`, join(dir, "additive.yaml"));
    const event: EventContext = { eventName: "workflow_dispatch", sha: "e".repeat(40), ref: "refs/heads/main" };
    const h = harness(dir, event, { base: `${base}:openapi.yaml`, head: "additive.yaml" });
    expect((await runAction(h.deps)).passed).toBe(true);
    expect(h.deps.inputs.commentKey).toBe("additive.yaml");
  });
});
