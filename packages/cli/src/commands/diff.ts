import { diffSpecs, ENGINE_NAME, ENGINE_VERSION, ingestSpec, type IngestedSpec } from "@drift/core";
import { DIFF_OUTPUT_ID, DiffOutput, ExitCode, type SpecSummary } from "@drift/report-schema";
import { absolute, createFsReader, displayPath } from "../fs-reader.ts";
import type { CliIo } from "../program.ts";
import { countLabel, renderChanges, renderDiagnostics } from "../render.ts";

export interface DiffOptions {
  base: string;
  head: string;
  format: "text" | "json";
  refRoot?: string;
}

/**
 * `drift diff --base <old> --head <new>`: structural changes only (no evidence yet; that is `compare`, M2).
 * Exit 0 when both specs are usable, whatever the changes; 2 when either spec has errors.
 */
export async function diffCommand(options: DiffOptions, io: CliIo, cwd: string): Promise<ExitCode> {
  const ingestOptions = {
    reader: createFsReader(),
    displayPath: displayPath(cwd),
    ...(options.refRoot === undefined ? {} : { refRoot: absolute(cwd, options.refRoot) }),
  };
  const [base, head] = await Promise.all([
    ingestSpec(absolute(cwd, options.base), ingestOptions),
    ingestSpec(absolute(cwd, options.head), ingestOptions),
  ]);
  if (!base.spec || !head.spec) {
    io.stderr(renderDiagnostics([...base.diagnostics, ...head.diagnostics].filter((d) => d.severity === "error")));
    io.stderr("✖ cannot diff: fix the errors above first (drift validate <spec> shows all diagnostics)\n");
    return ExitCode.UsageError;
  }
  const result = diffSpecs(base.spec.ir, head.spec.ir);
  if (options.format === "json") {
    const output = DiffOutput.parse({
      format: DIFF_OUTPUT_ID,
      engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
      base: summarize(base.spec),
      head: summarize(head.spec),
      changes: result.changes,
      impact: result.impact,
    });
    io.stdout(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    for (const [label, spec] of [
      ["base", base.spec],
      ["head", head.spec],
    ] as const) {
      io.stdout(
        `${label}  ${spec.file}  (OpenAPI ${spec.oasVersion}, ${countLabel(Object.keys(spec.ir.operations).length, "operation")})\n`
      );
    }
    io.stdout(`\n${renderChanges(result.changes)}`);
  }
  return ExitCode.Pass;
}

function summarize(spec: IngestedSpec): SpecSummary {
  return {
    file: spec.file,
    oasVersion: spec.oasVersion,
    title: spec.ir.info.title,
    version: spec.ir.info.version,
    specHash: spec.specHash,
    operations: Object.keys(spec.ir.operations).length,
  };
}
