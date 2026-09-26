import { ingestSpec } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { absolute, createFsReader, displayPath } from "../fs-reader.ts";
import type { CliIo } from "../program.ts";
import { countLabel, renderDiagnostics } from "../render.ts";

export interface ValidateOptions {
  format: "text" | "json";
  refRoot?: string;
}

/** `drift validate <spec>`: exit 0 when the spec is usable (warnings allowed), 2 when it has errors. */
export async function validateCommand(
  spec: string,
  options: ValidateOptions,
  io: CliIo,
  cwd: string
): Promise<ExitCode> {
  const result = await ingestSpec(absolute(cwd, spec), {
    reader: createFsReader(),
    displayPath: displayPath(cwd),
    ...(options.refRoot === undefined ? {} : { refRoot: absolute(cwd, options.refRoot) }),
  });
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.length - errors;
  if (options.format === "json") {
    const summary = result.spec
      ? {
          oasVersion: result.spec.oasVersion,
          operations: Object.keys(result.spec.ir.operations).length,
          specHash: result.spec.specHash,
        }
      : {};
    io.stdout(
      `${JSON.stringify({ valid: result.spec !== undefined, ...summary, diagnostics: result.diagnostics }, null, 2)}\n`
    );
  } else {
    io.stdout(renderDiagnostics(result.diagnostics));
    if (result.spec) {
      const operations = Object.keys(result.spec.ir.operations).length;
      io.stdout(
        `✔ ${result.spec.file}: valid OpenAPI ${result.spec.oasVersion} (${countLabel(operations, "operation")}, ${countLabel(warnings, "warning")})\n`
      );
    } else {
      io.stdout(`✖ ${countLabel(errors, "error")}, ${countLabel(warnings, "warning")}\n`);
    }
  }
  return result.spec ? ExitCode.Pass : ExitCode.UsageError;
}
