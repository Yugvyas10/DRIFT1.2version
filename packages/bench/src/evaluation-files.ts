import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { renderEvaluation, type MutationResults } from "./evaluation.ts";
import { PATHS } from "./paths.ts";
import type { PerfResults } from "./perf.ts";

async function readJson<T>(name: string): Promise<T | undefined> {
  const path = `${PATHS.evaluation}${name}`;
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as T) : undefined;
}

/** EVALUATION.md as it should be, given the committed result files. */
export async function expectedPage(): Promise<string> {
  return renderEvaluation(await readJson<PerfResults>("perf.json"), await readJson<MutationResults>("mutations.json"));
}

export async function writePage(): Promise<void> {
  await writeFile(PATHS.page, await expectedPage());
}
