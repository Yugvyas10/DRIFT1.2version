/** A time limit as people read it: "500 ms", "45 s", "10 min". */
export function duration(ms: number): string {
  if (ms < 1000) return `${String(ms)} ms`;
  if (ms < 60_000 || ms % 60_000 !== 0) return `${String(Math.round(ms / 1000))} s`;
  return `${String(ms / 60_000)} min`;
}
