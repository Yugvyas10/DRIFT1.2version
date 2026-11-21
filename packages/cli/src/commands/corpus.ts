import { inspectTraffic } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { absolute, displayPath } from "../fs-reader.ts";
import { loadSpec, loadTraffic, UsageError } from "../inputs.ts";
import type { CliIo } from "../program.ts";
import { renderDiagnostics } from "../render.ts";

/**
 * `drift corpus inspect <file>`: what DRIFT would read from a traffic file (counts, malformed lines, routing,
 * redaction), without comparing contracts. It prints no value from the traffic, only counts and pointers.
 */
export async function corpusInspectCommand(
  file: string,
  flags: { spec?: string; refRoot?: string; format: "text" | "json" },
  io: CliIo,
  cwd: string
): Promise<ExitCode> {
  const shown = displayPath(cwd);
  let result: Awaited<ReturnType<typeof inspectTraffic>>;
  try {
    let ir;
    if (flags.spec !== undefined) {
      const spec = await loadSpec(flags.spec, cwd, flags.refRoot);
      if (!spec.spec)
        throw new UsageError(renderDiagnostics(spec.diagnostics.filter((d) => d.severity === "error")).trimEnd());
      ir = spec.spec.ir;
    }
    const path = absolute(cwd, file);
    const traffic = await loadTraffic(path, shown(path));
    result = await inspectTraffic(traffic.open(), ir);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr(`${error.message}\n`);
    return ExitCode.UsageError;
  }
  if (flags.format === "json") {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return ExitCode.Pass;
  }
  let text = `${String(result.read)} records read, ${String(result.malformed)} malformed`;
  text += flags.spec === undefined ? "\n" : `, ${String(result.unrouted)} match no operation\n`;
  for (const example of result.malformedExamples) text += `  line ${String(example.line)}: ${example.reason}\n`;
  text += `\n${flags.spec === undefined ? "requests by path" : "requests by operation"}\n`;
  for (const [operation, count] of Object.entries(result.operations).sort(([a], [b]) => (a < b ? -1 : 1))) {
    text += `  ${String(count).padStart(6)}  ${operation}\n`;
  }
  const statuses = Object.entries(result.statuses).sort(([a], [b]) => (a < b ? -1 : 1));
  if (statuses.length > 0)
    text += `\nresponse statuses: ${statuses.map(([status, count]) => `${status} ×${String(count)}`).join(", ")}\n`;
  text += `\nredaction: ${String(result.redaction.values)} values in ${String(result.redaction.records)} records would be redacted\n`;
  for (const [pointer, count] of Object.entries(result.redaction.pointers).sort(([a], [b]) => (a < b ? -1 : 1))) {
    text += `  ${String(count).padStart(6)}  ${pointer}\n`;
  }
  io.stdout(text);
  return ExitCode.Pass;
}
