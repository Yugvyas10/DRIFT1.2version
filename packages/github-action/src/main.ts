import { tmpdir } from "node:os";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { uploadReport } from "@drift/cli";
import { createGitHubApi } from "./github.ts";
import { systemGit } from "./git.ts";
import { parseInputs } from "./inputs.ts";
import { runAction, type EventContext } from "./run.ts";

/** Entry point of the bundled Action (dist/index.js): real inputs, git, GitHub API and job summary. */
async function main(): Promise<void> {
  const inputs = parseInputs((name) => core.getInput(name));
  const token = core.getInput("token");
  // GitHub masks secrets it knows; this also masks the key if it reached the input another way.
  if (inputs.apiKey !== undefined) core.setSecret(inputs.apiKey);
  const pr = context.payload.pull_request as
    { number?: number; base?: { sha?: string }; head?: { sha?: string } } | undefined;
  const event: EventContext = { eventName: context.eventName, sha: context.sha, ref: context.ref };
  if (typeof pr?.number === "number" && typeof pr.base?.sha === "string") {
    event.pullRequest = {
      number: pr.number,
      baseSha: pr.base.sha,
      ...(typeof pr.head?.sha === "string" ? { headSha: pr.head.sha } : {}),
    };
  }
  // GITHUB_HEAD_REF is set, but empty, outside pull requests.
  const branch = [process.env.GITHUB_HEAD_REF, process.env.GITHUB_REF_NAME].find(
    (name) => name !== undefined && name !== ""
  );
  if (branch !== undefined) event.branch = branch;
  const before = (context.payload as { before?: unknown }).before;
  if (typeof before === "string") event.before = before;

  const result = await runAction({
    inputs,
    event,
    workspace: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    temp: process.env.RUNNER_TEMP ?? tmpdir(),
    git: systemGit,
    github: token === "" ? undefined : createGitHubApi(token, context.repo),
    log: { info: core.info, notice: core.notice, warning: core.warning },
    summary: async (markdown) => {
      await core.summary.addRaw(markdown, true).write();
    },
    setOutput: core.setOutput,
    upload: (report, options) => uploadReport(report, { ...options, fetch: globalThis.fetch }),
  });
  if (!result.passed) core.setFailed(result.failure ?? "DRIFT: the contract gate failed");
}

main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
