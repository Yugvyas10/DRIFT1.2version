import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { ExitCode } from "@drift/report-schema";
import { createGitSource, GitError, parseGitSpec } from "../git.ts";
import { loadPolicy, loadRuleset, UsageError } from "../inputs.ts";
import { displayPath } from "../fs-reader.ts";
import type { CliIo } from "../program.ts";
import {
  fileName,
  followRun,
  startRerun,
  startServerRun,
  type RunEvent,
  type RunFile,
  type StartedRun,
} from "../server-run.ts";
import { UploadError } from "../upload.ts";
import { commitOf } from "./compare.ts";

/** The platform's own limits (apps/web/src/server/services/server-runs.ts). */
const MAX_SPEC_BYTES = 20 * 1024 * 1024;
const MAX_TRAFFIC_BYTES = 256 * 1024 * 1024;

interface Tuning {
  policy?: string;
  rules?: string;
  failOn?: "breaking" | "risky";
  seed?: string;
  apiUrl?: string;
  /** False with `--no-wait`. */
  wait: boolean;
}

export interface RunFlags extends Tuning {
  base?: string;
  head?: string;
  traffic?: string;
  project?: string;
  commit?: string;
  branch?: string;
  pr?: string;
}

export interface RerunFlags extends Tuning {
  /** A file, or false with `--no-traffic`. */
  traffic?: string | false;
}

/** A local file, or `<ref>:<path>` read from git (a single file: server-side runs take single-file contracts). */
async function readInput(argument: string, cwd: string, maxBytes: number): Promise<RunFile> {
  let git: ReturnType<typeof parseGitSpec>;
  try {
    git = parseGitSpec(argument, cwd);
    if (git) {
      const source = await createGitSource(cwd, git);
      if ((await source.reader.size(source.entry)) > maxBytes) throw new UsageError(`drift: ${argument} is too large`);
      return { name: fileName(git.path), text: await source.reader.readText(source.entry) };
    }
  } catch (error) {
    if (error instanceof GitError) throw new UsageError(`drift: ${error.message}`);
    if (error instanceof UsageError) throw error;
    throw new UsageError(`drift: cannot read ${argument} from git`);
  }
  const path = resolve(cwd, argument);
  try {
    if ((await stat(path)).size > maxBytes) throw new UsageError(`drift: ${argument} is too large`);
    return { name: fileName(argument), text: await readFile(path, "utf8") };
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`drift: cannot read ${displayPath(cwd)(path)}`);
  }
}

async function readTraffic(argument: string, cwd: string) {
  const file = await readInput(argument, cwd, MAX_TRAFFIC_BYTES);
  return { ...file, format: argument.toLowerCase().endsWith(".har") ? ("har" as const) : ("jsonl" as const) };
}

async function tuning(flags: Tuning, cwd: string) {
  const seed = flags.seed === undefined ? undefined : Number(flags.seed);
  if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0)) {
    throw new UsageError("drift: --seed must be a whole number, 0 or more");
  }
  const policy = flags.policy === undefined ? undefined : resolve(cwd, flags.policy);
  const rules = flags.rules === undefined ? undefined : resolve(cwd, flags.rules);
  return {
    ...(policy === undefined ? {} : { policy: await loadPolicy(policy, displayPath(cwd)(policy)) }),
    ...(rules === undefined ? {} : { rules: await loadRuleset(rules, displayPath(cwd)(rules)) }),
    ...(flags.failOn === undefined ? {} : { failOn: flags.failOn }),
    ...(seed === undefined ? {} : { seed }),
  };
}

function platform(flags: Tuning, io: CliIo, command: string) {
  const env = io.env ?? {};
  const apiKey = env.DRIFT_API_KEY;
  if (apiKey === undefined || apiKey === "")
    throw new UsageError(`drift: ${command} needs an API key in DRIFT_API_KEY`);
  const apiUrl = flags.apiUrl ?? env.DRIFT_API_URL;
  if (apiUrl === undefined || apiUrl === "") {
    throw new UsageError(`drift: ${command} needs --api-url <url> or DRIFT_API_URL`);
  }
  if (!io.fetch) throw new UsageError("drift: the platform cannot be reached from here");
  return { apiUrl, apiKey, fetch: io.fetch };
}

/** One line per event, as the run goes. */
function describe(event: RunEvent): string {
  switch (event.type) {
    case "run.queued":
      return "queued\n";
    case "run.started":
      return `started   attempt ${String(event.attempt)}\n`;
    case "stage.started":
      return "";
    case "stage.finished":
      return `  ${event.stage.padEnd(12)} ${event.cacheHit ? "cached  " : "computed"} ${String(event.durationMs).padStart(6)} ms\n`;
    case "run.completed": {
      const { gate, summary } = event;
      return (
        `gate ${gate.passed ? "passed" : "FAILED"} (fail-on ${gate.failOn}): ${String(summary.breaking)} breaking, ` +
        `${String(summary.risky)} risky, ${String(summary.safe)} safe, ${String(summary.suppressed)} suppressed · semver ${event.semver}\n`
      );
    }
    case "run.failed":
      return event.willRetry ? `attempt failed (${event.category}); the platform will retry\n` : "";
  }
}

/** Prints the run, follows it unless `--no-wait`, and turns its outcome into the exit code. */
async function follow(
  started: StartedRun,
  flags: Tuning,
  io: CliIo,
  options: { apiUrl: string; apiKey: string; fetch: typeof globalThis.fetch }
): Promise<ExitCode> {
  io.stdout(
    `run ${started.id}${started.parentRunId === undefined ? "" : ` (re-run of ${started.parentRunId})`}` +
      `${started.replayed ? " (already started: same run)" : ""}  ${started.status}\n`
  );
  if (!flags.wait) return ExitCode.Pass;
  const final = await followRun({
    ...options,
    runId: started.id,
    onEvent: (event) => {
      if (event.type !== "run.queued" || started.status !== "queued") io.stdout(describe(event));
    },
  });
  if (final.type === "run.completed") return final.gate.passed ? ExitCode.Pass : ExitCode.GateFailed;
  if (final.type === "run.failed") {
    io.stderr(`drift: the run failed (${final.category}): ${final.message}\n`);
    return final.category === "invalid_spec" || final.category === "invalid_input"
      ? ExitCode.UsageError
      : ExitCode.InternalError;
  }
  return ExitCode.InternalError;
}

async function guarded(io: CliIo, body: () => Promise<ExitCode>): Promise<ExitCode> {
  try {
    return await body();
  } catch (error) {
    if (!(error instanceof UsageError) && !(error instanceof UploadError)) throw error;
    io.stderr(`${error.message}\n`);
    return ExitCode.UsageError;
  }
}

/**
 * `drift run`: a server-side run (PLAN M6). Uploads the contracts (and traffic) to the platform, which runs the
 * engine in its worker; follows the run's live events and exits like `drift compare`: 0 pass, 1 gate failed,
 * 2 bad input or a refused request, 3 when the platform failed the run.
 */
export function runCommand(flags: RunFlags, io: CliIo, cwd: string): Promise<ExitCode> {
  return guarded(io, async () => {
    if (flags.base === undefined || flags.head === undefined)
      throw new UsageError("drift: --base and --head are required");
    if (flags.project === undefined) throw new UsageError("drift: run needs --project <slug>");
    if (flags.pr !== undefined && !/^[1-9][0-9]*$/.test(flags.pr)) {
      throw new UsageError("drift: --pr must be a pull request number");
    }
    const options = platform(flags, io, "run");
    const env = io.env ?? {};
    const branch = flags.branch ?? env.GITHUB_HEAD_REF ?? env.GITHUB_REF_NAME;
    const started = await startServerRun({
      ...options,
      project: flags.project,
      commit: await commitOf(flags, env, cwd),
      ...(branch === undefined || branch === "" ? {} : { branch }),
      ...(flags.pr === undefined ? {} : { pullRequest: Number(flags.pr) }),
      trigger: env.CI === undefined || env.CI === "" || env.CI === "false" ? "manual" : "ci",
      base: await readInput(flags.base, cwd, MAX_SPEC_BYTES),
      head: await readInput(flags.head, cwd, MAX_SPEC_BYTES),
      ...(flags.traffic === undefined ? {} : { traffic: await readTraffic(flags.traffic, cwd) }),
      ...(await tuning(flags, cwd)),
    });
    return follow(started, flags, io, options);
  });
}

/** `drift rerun <run-id>`: the same contracts with a new corpus, policy, rules, fail-on or seed, as a child run. */
export function rerunCommand(runId: string, flags: RerunFlags, io: CliIo, cwd: string): Promise<ExitCode> {
  return guarded(io, async () => {
    const options = platform(flags, io, "rerun");
    const started = await startRerun({
      ...options,
      runId,
      ...(flags.traffic === undefined
        ? {}
        : { traffic: flags.traffic === false ? null : await readTraffic(flags.traffic, cwd) }),
      ...(await tuning(flags, cwd)),
    });
    return follow(started, flags, io, options);
  });
}
