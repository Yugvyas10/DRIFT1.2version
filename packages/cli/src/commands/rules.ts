import { DEFAULT_RULESET, type Ruleset } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { absolute, displayPath } from "../fs-reader.ts";
import { loadRuleset, UsageError } from "../inputs.ts";
import type { CliIo } from "../program.ts";

/** `drift rules list`: the ruleset in use (the default one, or `--rules <file>`), rendered from its data. */
export async function rulesListCommand(
  flags: { rules?: string; format: "text" | "json" },
  io: CliIo,
  cwd: string
): Promise<ExitCode> {
  let ruleset: Ruleset = DEFAULT_RULESET;
  if (flags.rules !== undefined) {
    const path = absolute(cwd, flags.rules);
    try {
      ruleset = await loadRuleset(path, displayPath(cwd)(path));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      io.stderr(`${error.message}\n`);
      return ExitCode.UsageError;
    }
  }
  if (flags.format === "json") {
    io.stdout(`${JSON.stringify(ruleset, null, 2)}\n`);
    return ExitCode.Pass;
  }
  const c = ruleset.confidence;
  let text = `${ruleset.format} ${ruleset.version}: ${String(ruleset.rules.length)} rules\n`;
  text += `confidence: synthetic-only failing ${String(c.syntheticFailing)}, halved every ${String(c.syntheticHalfLife)} passing recorded samples; rule of ${String(c.ruleOfThree)}\n`;
  text += "labels: failing evidence → BREAKING; otherwise dangerous → RISKY, safe → SAFE\n\n";
  const width = Math.max(...ruleset.rules.map((rule) => rule.id.length));
  for (const rule of ruleset.rules) {
    const flags = [
      rule.structural,
      rule.verifiable ? "verifiable" : "not verifiable",
      ...(rule.additive ? ["additive"] : []),
    ];
    text += `${rule.id.padEnd(width)}  ${flags.join(", ")}\n${" ".repeat(width + 2)}${rule.rationale}\n`;
  }
  io.stdout(text);
  return ExitCode.Pass;
}
