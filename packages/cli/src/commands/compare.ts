import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import {
  compare,
  DEFAULT_LIMITS,
  ingestSpec,
  parseDataText,
  parseRuleset,
  Policy,
  readHar,
  readJsonl,
  type CompareInput,
  type Ruleset,
  type TrafficInput,
} from "@drift/core";
import { ExitCode, type FailOn } from "@drift/report-schema";
import { absolute, createFsReader, displayPath } from "../fs-reader.ts";
import type { CliIo } from "../program.ts";
import { renderDiagnostics, renderReport } from "../render.ts";

export interface CompareOptions {
  base: string;
  head: string;
  traffic?: string;
  rules?: string;
  policy?: string;
  format: "text" | "json";
  failOn?: FailOn;
  seed: string;
  asOf?: string;
  refRoot?: string;
}

/** Largest HAR file read (HAR is one JSON document, so it cannot be streamed). JSONL has no size limit. */
const MAX_HAR_BYTES = 256 * 1024 * 1024;

class UsageError extends Error {}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function loadTraffic(path: string, shown: string): Promise<TrafficInput> {
  const hash = await sha256File(path);
  if (path.toLowerCase().endsWith(".har")) {
    if ((await stat(path)).size > MAX_HAR_BYTES) throw new UsageError(`${shown}: HAR file larger than 256 MiB`);
    let document: unknown;
    try {
      document = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new UsageError(`${shown}: not valid JSON (HAR files are JSON documents)`);
    }
    return { kind: "har", file: shown, hash, entries: readHar(document) };
  }
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  return { kind: "jsonl", file: shown, hash, entries: readJsonl(lines) };
}

async function loadData(path: string, shown: string): Promise<unknown> {
  const parsed = parseDataText(await readFile(path, "utf8"), shown, DEFAULT_LIMITS);
  if (!parsed.ok) throw new UsageError(renderDiagnostics(parsed.diagnostics).trimEnd());
  return parsed.value;
}

function describeZod(error: unknown, shown: string): string {
  const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  if (!issues) return `${shown}: ${error instanceof Error ? error.message : String(error)}`;
  return issues
    .map((issue) => `${shown}: ${issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : ""}${issue.message}`)
    .join("\n");
}

/**
 * `drift compare --base <old> --head <new> [--traffic <file>]`: the full pipeline with evidence and the gate.
 * Exit 0 when the gate passes, 1 when it fails, 2 for invalid specs, rules, policy or traffic files.
 */
export async function compareCommand(options: CompareOptions, io: CliIo, cwd: string): Promise<ExitCode> {
  const shown = displayPath(cwd);
  const ingestOptions = {
    reader: createFsReader(),
    displayPath: shown,
    ...(options.refRoot === undefined ? {} : { refRoot: absolute(cwd, options.refRoot) }),
  };
  const [base, head] = await Promise.all([
    ingestSpec(absolute(cwd, options.base), ingestOptions),
    ingestSpec(absolute(cwd, options.head), ingestOptions),
  ]);
  if (!base.spec || !head.spec) {
    io.stderr(renderDiagnostics([...base.diagnostics, ...head.diagnostics].filter((d) => d.severity === "error")));
    io.stderr("✖ cannot compare: fix the errors above first (drift validate <spec> shows all diagnostics)\n");
    return ExitCode.UsageError;
  }

  const seed = Number(options.seed);
  if (!Number.isSafeInteger(seed)) {
    io.stderr(`drift: --seed must be an integer\n`);
    return ExitCode.UsageError;
  }
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    io.stderr(`drift: --as-of must be a date such as 2026-09-28\n`);
    return ExitCode.UsageError;
  }

  const input: CompareInput = { base: base.spec, head: head.spec, asOf, seed };
  try {
    if (options.rules !== undefined) {
      const path = absolute(cwd, options.rules);
      const value = await loadData(path, shown(path));
      try {
        input.ruleset = parseRuleset(value) satisfies Ruleset;
      } catch (error) {
        throw new UsageError(describeZod(error, shown(path)));
      }
    }
    if (options.policy !== undefined) {
      const path = absolute(cwd, options.policy);
      const parsed = Policy.safeParse(await loadData(path, shown(path)));
      if (!parsed.success) throw new UsageError(describeZod(parsed.error, shown(path)));
      input.policy = parsed.data;
    }
    if (options.traffic !== undefined) {
      const path = absolute(cwd, options.traffic);
      input.traffic = await loadTraffic(path, shown(path));
    }
  } catch (error) {
    if (!(error instanceof UsageError)) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR" || code === "EACCES") {
        io.stderr(`drift: cannot read ${(error as NodeJS.ErrnoException).path ?? "file"} (${code})\n`);
        return ExitCode.UsageError;
      }
      throw error;
    }
    io.stderr(`${error.message}\n`);
    return ExitCode.UsageError;
  }
  if (options.failOn !== undefined) input.failOn = options.failOn;

  const report = await compare(input);
  io.stdout(options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));
  return report.gate.passed ? ExitCode.Pass : ExitCode.GateFailed;
}
