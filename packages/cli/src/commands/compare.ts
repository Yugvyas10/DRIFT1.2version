import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compare, REPORT_FILES, REPORT_FORMATS, renderReport, type CompareInput, type ReportFormat } from "@drift/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ExitCode, type FailOn, type Report } from "@drift/report-schema";
import { createFsCache } from "../cache.ts";
import { ConfigError, loadConfig } from "../config.ts";
import { displayPath } from "../fs-reader.ts";
import { loadPolicy, loadRuleset, loadSpecs, loadTraffic, UsageError } from "../inputs.ts";
import type { CliIo } from "../program.ts";
import { uploadReport, UploadError } from "../upload.ts";

/** Flags shared by `compare` and `explain`. Anything left unset comes from drift.config, then from defaults. */
export interface CompareFlags {
  base?: string;
  head?: string;
  traffic?: string;
  rules?: string;
  policy?: string;
  format?: string;
  out?: string;
  failOn?: FailOn;
  seed?: string;
  asOf?: string;
  refRoot?: string;
  config?: string;
  /** A directory, or false for `--no-cache`. */
  cache?: string | false;
  upload?: boolean;
  project?: string;
  apiUrl?: string;
  commit?: string;
  branch?: string;
  pr?: string;
}

export const DEFAULT_CACHE_DIR = ".drift/cache";

function parseFormats(value: string): ReportFormat[] {
  const formats = value.split(",").map((format) => format.trim());
  for (const format of formats) {
    if (!(REPORT_FORMATS as readonly string[]).includes(format)) {
      throw new UsageError(`drift: unknown format "${format}" (choose from ${REPORT_FORMATS.join(", ")})`);
    }
  }
  return [...new Set(formats)] as ReportFormat[];
}

/** Merges flags, drift.config and defaults, and loads every input. Throws UsageError for bad input. */
export async function prepareCompare(flags: CompareFlags, cwd: string) {
  const shown = displayPath(cwd);
  let loaded: Awaited<ReturnType<typeof loadConfig>>;
  try {
    loaded = await loadConfig(cwd, flags.config, shown);
  } catch (error) {
    if (error instanceof ConfigError) throw new UsageError(error.message);
    throw error;
  }
  const config = loaded?.config;
  const configDir = loaded?.dir ?? cwd;
  // A flag is relative to the working directory; a config value to the config file's directory.
  const pick = (flag: string | undefined, fromConfig: string | undefined) =>
    flag !== undefined
      ? { value: flag, dir: cwd }
      : fromConfig !== undefined
        ? { value: fromConfig, dir: configDir }
        : undefined;
  const path = (entry: { value: string; dir: string } | undefined) => entry && resolve(entry.dir, entry.value);

  const base = pick(flags.base, config?.base);
  const head = pick(flags.head, config?.head);
  if (!base || !head) throw new UsageError("drift: --base and --head are required (or set them in drift.config)");
  const refRoot = path(pick(flags.refRoot, config?.refRoot));
  const formats = flags.format !== undefined ? parseFormats(flags.format) : (config?.formats ?? ["console"]);
  const out = path(pick(flags.out, config?.out));
  if (!out && formats.length > 1) throw new UsageError("drift: several formats need --out <dir>");

  const seed = flags.seed !== undefined ? Number(flags.seed) : (config?.seed ?? 0);
  if (!Number.isSafeInteger(seed)) throw new UsageError("drift: --seed must be an integer");
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new UsageError("drift: --as-of must be a date such as 2026-09-28");

  const input: CompareInput = { ...(await loadSpecs(base, head, refRoot)), asOf, seed };
  const rules = path(pick(flags.rules, config?.rules));
  if (rules) input.ruleset = await loadRuleset(rules, shown(rules));
  const policy = path(pick(flags.policy, config?.policy));
  if (policy) input.policy = await loadPolicy(policy, shown(policy));
  const traffic = path(pick(flags.traffic, config?.traffic));
  if (traffic) input.traffic = await loadTraffic(traffic, shown(traffic));
  const failOn = flags.failOn ?? config?.failOn;
  if (failOn) input.failOn = failOn;
  if (flags.cache !== false && config?.cache !== false) {
    const dir =
      path(pick(typeof flags.cache === "string" ? flags.cache : undefined, config?.cache)) ??
      resolve(configDir, DEFAULT_CACHE_DIR);
    input.cache = createFsCache(dir);
  }
  return { input, formats, out, shown };
}

export function cacheLine(report: Report): string {
  const reused = report.stages.filter((stage) => stage.cached).map((stage) => stage.stage);
  return reused.length === 0 ? "" : `cache  reused ${reused.join(", ")} (inputs unchanged)\n`;
}

/**
 * `drift compare`: the full pipeline with evidence and the gate (PLAN §4.6).
 * Exit 0 when the gate passes, 1 when it fails, 2 for bad input (specs, rules, policy, traffic, config, flags).
 */
export async function compareCommand(flags: CompareFlags, io: CliIo, cwd: string): Promise<ExitCode> {
  let prepared: Awaited<ReturnType<typeof prepareCompare>>;
  try {
    prepared = await prepareCompare(flags, cwd);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr(`${error.message}\n`);
    return ExitCode.UsageError;
  }
  const { input, formats, out, shown } = prepared;
  const report = await compare(input);
  const color = io.color === true;
  if (!out) {
    const [format = "console"] = formats;
    io.stdout(renderReport(report, format, { color: color && format === "console" }));
    if (format === "console") io.stdout(cacheLine(report));
  } else {
    await mkdir(out, { recursive: true });
    const written: string[] = [];
    for (const format of formats) {
      const file = join(out, REPORT_FILES[format]);
      await writeFile(file, renderReport(report, format));
      written.push(shown(file));
    }
    io.stdout(renderReport(report, "console", { color }));
    io.stdout(cacheLine(report));
    io.stdout(`wrote ${written.join(", ")}\n`);
  }
  if (flags.upload === true) {
    try {
      const done = await upload(report, flags, io, cwd);
      io.stdout(`uploaded  run ${done.runId}${done.replayed ? " (already uploaded: same run)" : ""}\n`);
    } catch (error) {
      if (!(error instanceof UsageError) && !(error instanceof UploadError)) throw error;
      // The report above stands; a failed upload is reported and fails the command.
      io.stderr(`${error.message}\n`);
      return ExitCode.UsageError;
    }
  }
  return report.gate.passed ? ExitCode.Pass : ExitCode.GateFailed;
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** The commit a run is for: `--commit`, the CI's commit, or the repository's HEAD. */
export async function commitOf(
  flags: CompareFlags,
  env: Readonly<Record<string, string | undefined>>,
  cwd: string
): Promise<string> {
  let commit = flags.commit ?? env.GITHUB_SHA;
  if (commit === undefined) {
    try {
      commit = (await promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" })).stdout.trim();
    } catch {
      throw new UsageError("drift: --commit <sha> is needed outside a git repository");
    }
  }
  if (!SHA.test(commit)) throw new UsageError("drift: --commit must be a full commit SHA");
  return commit;
}

/** `--upload`: sends the run to the platform. The API key comes from DRIFT_API_KEY only, never from a flag. */
async function upload(report: Report, flags: CompareFlags, io: CliIo, cwd: string) {
  const env = io.env ?? {};
  const apiKey = env.DRIFT_API_KEY;
  if (apiKey === undefined || apiKey === "") throw new UsageError("drift: --upload needs an API key in DRIFT_API_KEY");
  const apiUrl = flags.apiUrl ?? env.DRIFT_API_URL;
  if (apiUrl === undefined || apiUrl === "")
    throw new UsageError("drift: --upload needs --api-url <url> or DRIFT_API_URL");
  if (flags.project === undefined) throw new UsageError("drift: --upload needs --project <slug>");
  if (flags.pr !== undefined && !/^[1-9][0-9]*$/.test(flags.pr))
    throw new UsageError("drift: --pr must be a pull request number");
  if (!io.fetch) throw new UsageError("drift: uploading is not available here");
  const branch = flags.branch ?? env.GITHUB_HEAD_REF ?? env.GITHUB_REF_NAME;
  return uploadReport(report, {
    apiUrl,
    apiKey,
    project: flags.project,
    commit: await commitOf(flags, env, cwd),
    ...(branch === undefined || branch === "" ? {} : { branch }),
    ...(flags.pr === undefined ? {} : { pullRequest: Number(flags.pr) }),
    trigger: env.CI === undefined || env.CI === "" || env.CI === "false" ? "manual" : "ci",
    fetch: io.fetch,
  });
}
