/** Time and peak memory of one run. Memory is the whole process's, sampled while the run is in progress. */
export interface Measurement {
  ms: number;
  /** Peak resident set size during the run, in MiB. */
  peakRssMiB: number;
  /** Peak V8 heap in use during the run, in MiB. */
  peakHeapMiB: number;
}

const MIB = 1024 * 1024;

/**
 * Runs `work` and samples `process.memoryUsage()` every `intervalMs` until it finishes. Sampling is coarse, so
 * a peak shorter than the interval can be missed; the interval is recorded with the results.
 */
export async function measure<T>(
  work: () => Promise<T>,
  intervalMs = 25,
  clock: () => number = performance.now.bind(performance)
): Promise<{ result: T; measurement: Measurement }> {
  let peakRss = 0;
  let peakHeap = 0;
  const sample = () => {
    const usage = process.memoryUsage();
    peakRss = Math.max(peakRss, usage.rss);
    peakHeap = Math.max(peakHeap, usage.heapUsed);
  };
  sample();
  const timer = setInterval(sample, intervalMs);
  const started = clock();
  try {
    const result = await work();
    const ms = clock() - started;
    sample();
    return {
      result,
      measurement: {
        ms: Math.round(ms),
        peakRssMiB: Math.round(peakRss / MIB),
        peakHeapMiB: Math.round(peakHeap / MIB),
      },
    };
  } finally {
    clearInterval(timer);
  }
}
