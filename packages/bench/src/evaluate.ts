import { posix } from "node:path";
import { compare, ingestSpec, type IngestedSpec, type SpecReader } from "@drift/core";
import { MUTATION_OPERATORS, mutate } from "./mutations.ts";

/** A SpecReader over in-memory files, for ingesting mutated documents without writing them to disk. */
export function memoryReader(files: ReadonlyMap<string, string>): SpecReader {
  return {
    size: (path) => {
      const text = files.get(path);
      return text === undefined
        ? Promise.reject(new Error(`no file ${path}`))
        : Promise.resolve(Buffer.byteLength(text));
    },
    readText: (path) => {
      const text = files.get(path);
      return text === undefined ? Promise.reject(new Error(`no file ${path}`)) : Promise.resolve(text);
    },
    realpath: (path) => Promise.resolve(posix.normalize(path)),
  };
}

export async function ingestText(text: string, name: string): Promise<IngestedSpec> {
  const path = `/mutations/${name}`;
  const result = await ingestSpec(path, { reader: memoryReader(new Map([[path, text]])) });
  if (!result.spec) {
    throw new Error(`${name} is not a valid spec: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.spec;
}

/** DRIFT's verdict on one mutation: the highest label among the changes it reports (or none). */
export type Verdict = "BREAKING" | "RISKY" | "SAFE" | "none";

export interface MutationResult {
  spec: string;
  operator: string;
  label: "breaking" | "safe";
  description: string;
  verdict: Verdict;
  changes: number;
  ms: number;
}

/**
 * Applies every operator with each seed to a document, compares the original with each mutant (no traffic, so
 * request evidence is synthetic), and records DRIFT's verdict next to the operator's label. Duplicate mutants
 * (the same description) and operators without a suitable site are skipped.
 */
export async function runMutations(
  name: string,
  document: Record<string, unknown>,
  seeds: readonly number[],
  clock: () => number = performance.now.bind(performance)
): Promise<{ results: MutationResult[]; skipped: string[] }> {
  const base = await ingestText(JSON.stringify(document), `${name}.json`);
  const results: MutationResult[] = [];
  const skipped: string[] = [];
  for (const operator of MUTATION_OPERATORS) {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const mutation = mutate(document as never, operator, seed);
      if (!mutation) {
        skipped.push(`${name}: ${operator} (no suitable place)`);
        break;
      }
      if (seen.has(mutation.description)) continue;
      seen.add(mutation.description);
      const started = clock();
      const head = await ingestText(JSON.stringify(mutation.document), `${name}-${operator}-${String(seed)}.json`);
      const report = await compare({ base, head, asOf: "2026-01-01", seed });
      const order: Verdict[] = ["BREAKING", "RISKY", "SAFE"];
      const verdict = order.find((label) => report.changes.some((change) => change.severity === label)) ?? "none";
      results.push({
        spec: name,
        operator,
        label: mutation.label,
        description: mutation.description,
        verdict,
        changes: report.changes.length,
        ms: Math.round(clock() - started),
      });
    }
  }
  return { results, skipped };
}

export interface MutationSummary {
  breaking: { total: number; proven: number; flagged: number; missed: number };
  safe: { total: number; falseBreaking: number; flagged: number; clean: number };
  /** Of the mutants DRIFT labelled BREAKING, the share that really are breaking. Null when there were none. */
  precision: number | null;
  /** Of the breaking mutants, the share DRIFT proved BREAKING. */
  recall: number | null;
}

export function summarise(results: readonly MutationResult[]): MutationSummary {
  const breaking = results.filter((result) => result.label === "breaking");
  const safe = results.filter((result) => result.label === "safe");
  const count = (list: readonly MutationResult[], ...verdicts: Verdict[]) =>
    list.filter((result) => verdicts.includes(result.verdict)).length;
  const proven = count(breaking, "BREAKING");
  const falseBreaking = count(safe, "BREAKING");
  const ratio = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 1000);
  return {
    breaking: {
      total: breaking.length,
      proven,
      flagged: count(breaking, "RISKY"),
      missed: count(breaking, "SAFE", "none"),
    },
    safe: { total: safe.length, falseBreaking, flagged: count(safe, "RISKY"), clean: count(safe, "SAFE", "none") },
    precision: ratio(proven, proven + falseBreaking),
    recall: ratio(proven, breaking.length),
  };
}
