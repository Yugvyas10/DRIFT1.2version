import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import {
  DEFAULT_LIMITS,
  ingestSpec,
  parseDataText,
  parseRuleset,
  Policy,
  readHar,
  readJsonl,
  type IngestResult,
  type TrafficInput,
} from "@drift/core";
import type { Diagnostic } from "@drift/report-schema";
import { absolute, createFsReader, displayPath } from "./fs-reader.ts";
import { createGitSource, GitError, parseGitSpec } from "./git.ts";
import { renderDiagnostics } from "./render.ts";

/** A problem with the user's input: reported on stderr with exit code 2. */
export class UsageError extends Error {}

/** Largest HAR file read (HAR is one JSON document, so it cannot be streamed). JSONL has no size limit. */
const MAX_HAR_BYTES = 256 * 1024 * 1024;

/** Ingests a spec from the working tree, or from git when the argument is `<ref>:<path>`. */
export async function loadSpec(argument: string, cwd: string, refRoot: string | undefined): Promise<IngestResult> {
  let git: ReturnType<typeof parseGitSpec>;
  try {
    git = parseGitSpec(argument, cwd);
  } catch (error) {
    throw new UsageError(`drift: ${(error as Error).message}`);
  }
  const root = refRoot === undefined ? {} : { refRoot: absolute(cwd, refRoot) };
  if (!git) {
    return ingestSpec(absolute(cwd, argument), { reader: createFsReader(), displayPath: displayPath(cwd), ...root });
  }
  try {
    const source = await createGitSource(cwd, git);
    return await ingestSpec(source.entry, { reader: source.reader, displayPath: source.display, ...root });
  } catch (error) {
    if (error instanceof GitError) throw new UsageError(`drift: ${error.message}`);
    throw error;
  }
}

/** Ingests both specs (each relative to its own directory); on errors, a usage error listing them. */
export async function loadSpecs(
  base: { value: string; dir: string },
  head: { value: string; dir: string },
  refRoot: string | undefined
) {
  const [b, h] = await Promise.all([loadSpec(base.value, base.dir, refRoot), loadSpec(head.value, head.dir, refRoot)]);
  if (!b.spec || !h.spec) {
    const errors: Diagnostic[] = [...b.diagnostics, ...h.diagnostics].filter((d) => d.severity === "error");
    throw new UsageError(
      `${renderDiagnostics(errors)}✖ cannot compare: fix the errors above first (drift validate <spec> shows all diagnostics)`
    );
  }
  return { base: b.spec, head: h.spec };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Wraps file-system errors (missing, unreadable) as usage errors. */
async function readable<T>(path: string, shown: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR" || code === "EACCES")
      throw new UsageError(`drift: cannot read ${shown} (${code})`);
    throw error;
  }
}

export async function loadTraffic(path: string, shown: string): Promise<TrafficInput> {
  const hash = await readable(path, shown, () => sha256File(path));
  if (path.toLowerCase().endsWith(".har")) {
    if ((await stat(path)).size > MAX_HAR_BYTES) throw new UsageError(`${shown}: HAR file larger than 256 MiB`);
    let document: unknown;
    try {
      document = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new UsageError(`${shown}: not valid JSON (HAR files are JSON documents)`);
    }
    return { kind: "har", file: shown, hash, open: () => readHar(document) };
  }
  const open = () => readJsonl(createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity }));
  return { kind: "jsonl", file: shown, hash, open };
}

async function loadData(path: string, shown: string): Promise<unknown> {
  const text = await readable(path, shown, () => readFile(path, "utf8"));
  const parsed = parseDataText(text, shown, DEFAULT_LIMITS);
  if (!parsed.ok) throw new UsageError(renderDiagnostics(parsed.diagnostics).trimEnd());
  return parsed.value;
}

export function describeZod(error: unknown, shown: string): string {
  const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  if (!issues) return `${shown}: ${error instanceof Error ? error.message : String(error)}`;
  return issues
    .map((issue) => `${shown}: ${issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : ""}${issue.message}`)
    .join("\n");
}

export async function loadRuleset(path: string, shown: string) {
  const value = await loadData(path, shown);
  try {
    return parseRuleset(value);
  } catch (error) {
    throw new UsageError(describeZod(error, shown));
  }
}

export async function loadPolicy(path: string, shown: string) {
  const parsed = Policy.safeParse(await loadData(path, shown));
  if (!parsed.success) throw new UsageError(describeZod(parsed.error, shown));
  return parsed.data;
}
