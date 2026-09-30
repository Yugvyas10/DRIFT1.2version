import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { prepareCompare, UsageError, type CompareFlags } from "@drift/cli";
import { compare, escapeMarkdown, MARKDOWN_MARKER, REPORT_FILES, renderMarkdown, renderReport } from "@drift/core";
import type { Report } from "@drift/report-schema";
import { COMMENT_LIMIT, keyMarker, upsertComment, type GitHubApi } from "./comment.ts";
import { isSha, type Git } from "./git.ts";
import type { ActionInputs } from "./inputs.ts";

/** What the Action needs to know about the event that started the workflow. */
export interface EventContext {
  eventName: string;
  /** The commit and ref being checked (for a pull request: the merge commit and `refs/pull/N/merge`). */
  sha: string;
  ref: string;
  pullRequest?: { number: number; baseSha: string };
  /** For a push: the commit before it (all zeros for a new branch). */
  before?: string;
}

export interface Log {
  info(message: string): void;
  notice(message: string): void;
  warning(message: string): void;
}

export interface ActionDeps {
  inputs: ActionInputs;
  event: EventContext;
  workspace: string;
  /** A directory for the report files (RUNNER_TEMP in a workflow). */
  temp: string;
  git: Git;
  /** Undefined when no token was given. */
  github: GitHubApi | undefined;
  log: Log;
  summary(markdown: string): Promise<void>;
  setOutput(name: string, value: string): void;
  /** The date for suppression expiry (defaults to today). */
  asOf?: string;
}

export interface ActionResult {
  passed: boolean;
  /** Why the step fails, for setFailed. */
  failure?: string;
}

/** A step summary holds 1 MiB; the report stays well below that. */
const SUMMARY_LIMIT = 900_000;
const REPORT_FORMATS_WRITTEN = ["json", "md", "html", "sarif"] as const;

/** The commit to compare against: the pull request's base, or the commit before a push. */
function baseCommit(event: EventContext): string | undefined {
  if (event.pullRequest) return event.pullRequest.baseSha;
  if (event.before && !/^0+$/.test(event.before)) return event.before;
  return undefined;
}

/**
 * The Action (PLAN M4): runs `drift compare` for the step's contract, writes the Markdown report to the job
 * summary, upserts one pull-request comment, optionally uploads SARIF, and reports whether the gate passed.
 * Engine logic stays in @drift/core; inputs are prepared exactly as the CLI prepares them.
 */
export async function runAction(deps: ActionDeps): Promise<ActionResult> {
  const { inputs, event, log } = deps;
  const cwd = resolve(deps.workspace, inputs.workingDirectory);

  const flags: CompareFlags = { cache: false, format: REPORT_FORMATS_WRITTEN.join(",") };
  const head = inputs.head ?? inputs.spec;
  if (head !== undefined) flags.head = head;
  if (inputs.base !== undefined) {
    flags.base = inputs.base;
  } else if (inputs.spec !== undefined) {
    const sha = baseCommit(event);
    if (sha === undefined || !isSha(sha)) {
      throw new UsageError(
        `drift: cannot tell which commit to compare with for a "${event.eventName}" event; set the input "base"`
      );
    }
    if (!(await deps.git.has(cwd, `${sha}^{commit}`))) {
      log.info(`Fetching the base commit ${sha}`);
      try {
        await deps.git.fetch(cwd, sha);
      } catch {
        throw new UsageError(
          `drift: could not fetch the base commit ${sha}; check out with "fetch-depth: 0" or set the input "base"`
        );
      }
    }
    if (!(await deps.git.has(cwd, `${sha}:./${inputs.spec}`))) {
      const message = `${inputs.spec} does not exist at the base commit ${sha.slice(0, 12)}: a new contract, so there is nothing it could break.`;
      if (inputs.baseMissing === "fail") return { passed: false, failure: `drift: ${message}` };
      log.notice(message);
      await deps.summary(
        `${MARKDOWN_MARKER}\n## ✅ DRIFT: nothing to compare\n\n${escapeMarkdown(message)} The gate passes (base-missing: pass).\n`
      );
      deps.setOutput("passed", "true");
      return { passed: true };
    }
    flags.base = `${sha}:${inputs.spec}`;
  }
  for (const key of ["traffic", "rules", "policy", "config", "failOn"] as const) {
    const value = inputs[key];
    if (value !== undefined) (flags as Record<string, string>)[key] = value;
  }
  if (deps.asOf !== undefined) flags.asOf = deps.asOf;

  const out = join(deps.temp, "drift", inputs.commentKey.replace(/\//g, "_"));
  flags.out = out;
  const { input } = await prepareCompare(flags, cwd);
  const report = await compare(input);

  await mkdir(out, { recursive: true });
  for (const format of REPORT_FORMATS_WRITTEN)
    await writeFile(join(out, REPORT_FILES[format]), renderReport(report, format));
  deps.setOutput("report-dir", out);
  setCounts(deps, report);

  await deps.summary(renderMarkdown(report, { maxLength: SUMMARY_LIMIT, fullReport: `The full report is in ${out}.` }));

  if (inputs.comment) await comment(deps, report);
  if (inputs.sarif) await uploadSarif(deps, report);
  if (inputs.upload) {
    log.warning("upload: not built yet. The DRIFT platform's ingestion API arrives in M5; nothing was sent anywhere.");
  }
  deps.setOutput("passed", String(report.gate.passed));
  if (report.gate.passed) return { passed: true };
  const s = report.summary;
  return {
    passed: false,
    failure: `DRIFT: the contract gate failed (${String(s.breaking)} BREAKING, ${String(s.risky)} RISKY, fail-on ${report.gate.failOn})`,
  };
}

function setCounts(deps: ActionDeps, report: Report): void {
  deps.setOutput("breaking", String(report.summary.breaking));
  deps.setOutput("risky", String(report.summary.risky));
  deps.setOutput("safe", String(report.summary.safe));
  deps.setOutput("semver", report.semver);
}

async function comment(deps: ActionDeps, report: Report): Promise<void> {
  const pr = deps.event.pullRequest;
  if (!pr) return; // only pull requests have a conversation to comment on
  if (!deps.github) {
    deps.log.warning("comment: no token, so no pull-request comment (the job summary has the report)");
    return;
  }
  const room = COMMENT_LIMIT - keyMarker(deps.inputs.commentKey).length - 2;
  const markdown = renderMarkdown(report, {
    maxLength: room,
    fullReport: "The full report is in this run's job summary.",
  });
  try {
    const done = await upsertComment(deps.github, pr.number, deps.inputs.commentKey, markdown);
    deps.log.info(`Pull-request comment ${done}`);
  } catch (error) {
    // A pull request from a fork gets a read-only token; the gate result does not depend on the comment.
    deps.log.warning(
      `comment: could not write the pull-request comment (${error instanceof Error ? error.message : String(error)}). The token needs "pull-requests: write"; pull requests from forks only get a read-only token.`
    );
  }
}

async function uploadSarif(deps: ActionDeps, report: Report): Promise<void> {
  if (!deps.github) {
    deps.log.warning("sarif: no token, so the SARIF report was not uploaded");
    return;
  }
  const sarif = gzipSync(renderReport(report, "sarif")).toString("base64");
  try {
    await deps.github.uploadSarif({ commitSha: deps.event.sha, ref: deps.event.ref, sarif });
    deps.log.info("SARIF uploaded to code scanning");
  } catch (error) {
    deps.log.warning(
      `sarif: the upload failed (${error instanceof Error ? error.message : String(error)}). It needs "security-events: write" and code scanning enabled for the repository.`
    );
  }
}
