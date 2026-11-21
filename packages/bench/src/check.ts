import { diffSpecs, ingestSpec, type SpecReader } from "@drift/core";

/** Machine-readable result of checking one fixture: it must ingest, and diffing it with itself must find nothing. */
export interface FixtureCheck {
  id: string;
  ok: boolean;
  problems: string[];
  oasVersion?: string;
  operations?: number;
  componentSchemas?: number;
  warnings?: number;
  specHash?: string;
  selfDiffChanges?: number;
  ingestMs: number;
  diffMs: number;
}

export async function checkFixture(
  id: string,
  path: string,
  reader: SpecReader,
  now: () => number = performance.now.bind(performance)
): Promise<FixtureCheck> {
  const started = now();
  const result = await ingestSpec(path, { reader });
  const ingestMs = Math.round(now() - started);
  if (!result.spec) {
    const problems = result.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`);
    return { id, ok: false, problems, ingestMs, diffMs: 0 };
  }
  const diffStarted = now();
  const { changes } = diffSpecs(result.spec.ir, result.spec.ir);
  const diffMs = Math.round(now() - diffStarted);
  const problems = changes.length > 0 ? [`self-diff found ${changes.length} changes; expected none`] : [];
  return {
    id,
    ok: problems.length === 0,
    problems,
    oasVersion: result.spec.oasVersion,
    operations: Object.keys(result.spec.ir.operations).length,
    componentSchemas: Object.keys(result.spec.ir.schemas).length,
    warnings: result.diagnostics.length,
    specHash: result.spec.specHash,
    selfDiffChanges: changes.length,
    ingestMs,
    diffMs,
  };
}
