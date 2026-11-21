import type { SpecIR } from "../ingest/ir.ts";
import { DEFAULT_REDACTION, redactSample, type RedactionOptions } from "./redact.ts";
import { Router } from "./router.ts";
import type { RoutedSample } from "./sample.ts";
import { toSample, type TrafficEntry } from "./traffic.ts";

export interface CorpusOptions {
  /** Recorded samples kept per operation. */
  perOperationCap: number;
  /** Recorded samples kept in total; operations share it in turns, so every operation keeps some. */
  totalCap: number;
  /** Rotates which samples are kept, deterministically. */
  seed: number;
  redaction: RedactionOptions;
  /** Malformed lines listed in the report (all are counted). */
  maxMalformedExamples: number;
}

export const DEFAULT_CORPUS_OPTIONS: CorpusOptions = {
  perOperationCap: 1000,
  totalCap: 50_000,
  seed: 0,
  redaction: DEFAULT_REDACTION,
  maxMalformedExamples: 10,
};

export interface CorpusStats {
  read: number;
  malformed: number;
  malformedExamples: { line: number; reason: string }[];
  unrouted: number;
  outOfScope: number;
  sampled: number;
}

/** Stage 3 output for recorded traffic: redacted samples of affected operations, sorted by operation and line. */
export interface Corpus {
  samples: RoutedSample[];
  stats: CorpusStats;
}

/** A fast 32-bit mix (MurmurHash3 finaliser) of a line number and the seed: the sampling priority. */
function priority(line: number, seed: number): number {
  let h = (line ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

interface Candidate {
  rank: number;
  line: number;
  sample: RoutedSample;
}

const byRank = (a: Candidate, b: Candidate) => a.rank - b.rank || a.line - b.line;

/**
 * Stage 3 — Corpus, recorded part (PLAN §4.3). Streams the entries once; memory is bounded by the caps.
 *
 * - Routing uses the **old** contract, because recorded traffic was sent against it.
 * - Only operations in the impact index are kept (the others cannot provide evidence).
 * - Sampling keeps, per operation, the samples with the lowest priority hash: a deterministic, order-independent
 *   stand-in for reservoir sampling. The global cap is then shared out in turns across operations.
 * - Redaction runs on every kept sample, before anything is stored or reported. Dropped samples are never
 *   stored or reported, so they are not redacted.
 */
export async function buildCorpus(
  entries: AsyncIterable<TrafficEntry> | Iterable<TrafficEntry>,
  base: SpecIR,
  affected: ReadonlySet<string>,
  options: CorpusOptions = DEFAULT_CORPUS_OPTIONS
): Promise<Corpus> {
  const router = new Router(base);
  const stats: CorpusStats = { read: 0, malformed: 0, malformedExamples: [], unrouted: 0, outOfScope: 0, sampled: 0 };
  const perOperation = new Map<string, Candidate[]>();

  for await (const entry of entries) {
    stats.read++;
    if ("malformed" in entry) {
      stats.malformed++;
      if (stats.malformedExamples.length < options.maxMalformedExamples) {
        stats.malformedExamples.push({ line: entry.line, reason: entry.malformed });
      }
      continue;
    }
    const sample = toSample(entry.line, entry.record);
    const route = router.match(sample.method, sample.path);
    if (!route) {
      stats.unrouted++;
      continue;
    }
    if (!affected.has(route.operation)) {
      stats.outOfScope++;
      continue;
    }
    const list = perOperation.get(route.operation) ?? [];
    list.push({ rank: priority(entry.line, options.seed), line: entry.line, sample: { ...sample, ...route } });
    if (list.length >= options.perOperationCap * 2) list.sort(byRank).length = options.perOperationCap;
    perOperation.set(route.operation, list);
  }

  const queues = [...perOperation.keys()].sort().map((key) => {
    const list = perOperation.get(key) ?? [];
    return list.sort(byRank).slice(0, options.perOperationCap);
  });
  const kept: Candidate[] = [];
  for (let round = 0; kept.length < options.totalCap; round++) {
    let took = false;
    for (const queue of queues) {
      const candidate = queue[round];
      if (candidate && kept.length < options.totalCap) {
        kept.push(candidate);
        took = true;
      }
    }
    if (!took) break;
  }

  const samples = kept
    .map((candidate) => redactSample(candidate.sample, options.redaction))
    .sort((a, b) => (a.operation < b.operation ? -1 : a.operation > b.operation ? 1 : (a.line ?? 0) - (b.line ?? 0)));
  stats.sampled = samples.length;
  return { samples, stats };
}
