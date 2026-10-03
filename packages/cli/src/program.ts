import { ENGINE_VERSION, REPORT_FORMATS } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { Command, CommanderError, Option } from "commander";
import { compareCommand, type CompareFlags } from "./commands/compare.ts";
import { corpusInspectCommand } from "./commands/corpus.ts";
import { explainCommand, type ExplainFlags } from "./commands/explain.ts";
import { rulesListCommand } from "./commands/rules.ts";
import { rerunCommand, runCommand, type RerunFlags, type RunFlags } from "./commands/run.ts";
import { diffCommand } from "./commands/diff.ts";
import { validateCommand } from "./commands/validate.ts";
import { CLI_VERSION } from "./version.ts";

/** Where the CLI writes. Injected so tests can capture output without touching the process. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Whether stdout may use ANSI colours (decided by the binary: a terminal, and no NO_COLOR). */
  color?: boolean;
  /** Environment variables (DRIFT_API_KEY, DRIFT_API_URL, CI variables). The binary passes `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
  /** HTTP client for `--upload`. The binary passes the global `fetch`. */
  fetch?: typeof globalThis.fetch;
}

const formatOption = () => new Option("--format <format>", "output format").choices(["text", "json"]).default("text");
const refRootOption = () =>
  new Option("--ref-root <dir>", "directory that local $refs must stay inside (default: the spec's directory)");

/**
 * Builds the `drift` command tree. Commands are added milestone by milestone (PLAN §6):
 * `validate` and `diff` in M1, `compare` in M2, `explain`, `rules list` and `corpus inspect` in M3, `run` and
 * `rerun` (server-side runs on the platform) in M6.
 * Each command stores its exit code in `result`; `runCli` returns it.
 */
export function createProgram(io: CliIo, result: { exitCode: ExitCode }, cwd: string): Command {
  const program = new Command("drift")
    .description("Evidence-based API contract compatibility gate for CI/CD.")
    .version(`${CLI_VERSION} (engine ${ENGINE_VERSION})`, "-v, --version", "print the CLI and engine versions")
    .helpOption("-h, --help", "show help")
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .showHelpAfterError()
    .exitOverride();

  program
    .command("validate")
    .description("check that a spec is a valid OpenAPI 3.0/3.1 document; errors are reported as file:line:col")
    .argument("<spec>", "path to the OpenAPI document (YAML or JSON)")
    .addOption(formatOption())
    .addOption(refRootOption())
    .action(async (spec: string, options: { format: "text" | "json"; refRoot?: string }) => {
      result.exitCode = await validateCommand(spec, options, io, cwd);
    });

  program
    .command("diff")
    .description("list the structural changes between two specs (no evidence or gate; see `compare`)")
    .requiredOption("--base <spec>", "the old contract")
    .requiredOption("--head <spec>", "the new contract")
    .addOption(formatOption())
    .addOption(refRootOption())
    .action(async (options: { base: string; head: string; format: "text" | "json"; refRoot?: string }) => {
      result.exitCode = await diffCommand(options, io, cwd);
    });

  const compareOptions = (command: Command) =>
    command
      .option("--base <spec>", "the old contract: a file, or <git-ref>:<path> such as origin/main:openapi.yaml")
      .option("--head <spec>", "the new contract (a file or <git-ref>:<path>)")
      .option("--traffic <file>", "recorded traffic: drift-traffic/v1 JSONL, or a .har file")
      .option("--rules <file>", "a complete ruleset (drift-rules/v1, YAML or JSON) instead of the default one")
      .option("--policy <file>", "project policy: fail-on, escalations and suppressions (drift-policy/v1)")
      .addOption(
        new Option("--fail-on <level>", "fail the gate on BREAKING (default) or on RISKY too").choices([
          "breaking",
          "risky",
        ])
      )
      .option("--seed <n>", "seed for sampling and synthetic samples (deterministic; default 0)")
      .option("--as-of <date>", "date suppressions are checked against (default: today, UTC)")
      .option(
        "--config <file>",
        "config file (default: drift.config.json or drift.config.yaml in the working directory)"
      )
      .option("--cache <dir>", "stage cache directory (default: .drift/cache)")
      .option("--no-cache", "compute every stage, reading and writing no cache")
      .addOption(refRootOption());

  compareOptions(
    program
      .command("compare")
      .description("compare two specs with evidence and gate the result (exit 1 when the gate fails)")
      .option("--format <list>", `report formats, comma-separated: ${REPORT_FORMATS.join(", ")} (default: console)`)
      .option("--out <dir>", "write every format to <dir>/drift-report.* (needed for more than one format)")
      .option("--upload", "upload the run to the DRIFT platform (needs DRIFT_API_KEY, --project and an API URL)")
      .option("--project <slug>", "the platform project to upload to")
      .option("--api-url <url>", "base URL of the DRIFT platform (default: DRIFT_API_URL)")
      .option("--commit <sha>", "the commit this run is for (default: GITHUB_SHA, or git rev-parse HEAD)")
      .option("--branch <name>", "the branch this run is for (default: from the CI environment)")
      .option("--pr <number>", "the pull request this run is for")
  ).action(async (options: CompareFlags) => {
    result.exitCode = await compareCommand(options, io, cwd);
  });

  compareOptions(
    program
      .command("explain")
      .description("show everything about one change: rule, rationale, evidence and failing samples")
      .argument("<change-id>", "the id shown in brackets by drift compare (a unique prefix is enough)")
      .option("--report <file>", "read a saved drift compare --format json report instead of comparing again")
      .addOption(formatOption())
  ).action(async (id: string, options: ExplainFlags) => {
    result.exitCode = await explainCommand(id, options, io, cwd);
  });

  const serverOptions = (command: Command) =>
    command
      .option("--policy <file>", "project policy: fail-on, escalations and suppressions (drift-policy/v1)")
      .option("--rules <file>", "a complete ruleset (drift-rules/v1, YAML or JSON) instead of the default one")
      .addOption(
        new Option("--fail-on <level>", "fail the gate on BREAKING (default) or on RISKY too").choices([
          "breaking",
          "risky",
        ])
      )
      .option("--seed <n>", "seed for sampling and synthetic samples (deterministic; default 0)")
      .option("--api-url <url>", "base URL of the DRIFT platform (default: DRIFT_API_URL)")
      .option("--no-wait", "start the run and exit without following it");

  serverOptions(
    program
      .command("run")
      .description("compare two specs on the DRIFT platform: upload them, follow the run live, gate on its result")
      .option("--base <spec>", "the old contract: a file, or <git-ref>:<path> (a single file)")
      .option("--head <spec>", "the new contract (a file or <git-ref>:<path>)")
      .option("--traffic <file>", "recorded traffic: drift-traffic/v1 JSONL, or a .har file")
      .option("--project <slug>", "the platform project")
      .option("--commit <sha>", "the commit this run is for (default: GITHUB_SHA, or git rev-parse HEAD)")
      .option("--branch <name>", "the branch this run is for (default: from the CI environment)")
      .option("--pr <number>", "the pull request this run is for")
  ).action(async (options: RunFlags) => {
    result.exitCode = await runCommand(options, io, cwd);
  });

  serverOptions(
    program
      .command("rerun")
      .description(
        "run a platform run again with new traffic, policy, rules, fail-on or seed (a child run; cached stages are reused)"
      )
      .argument("<run-id>", "the run to re-run")
      .option("--traffic <file>", "new recorded traffic (default: the run's own)")
      .option("--no-traffic", "re-run without traffic")
  ).action(async (runId: string, options: RerunFlags) => {
    result.exitCode = await rerunCommand(runId, options, io, cwd);
  });

  const rules = program.command("rules").description("inspect classification rules");
  rules
    .command("list")
    .description("list the rules in use: structural judgement, whether samples can prove it, rationale")
    .option("--rules <file>", "a ruleset file instead of the default rules")
    .addOption(formatOption())
    .action(async (options: { rules?: string; format: "text" | "json" }) => {
      result.exitCode = await rulesListCommand(options, io, cwd);
    });

  const corpus = program.command("corpus").description("inspect recorded traffic");
  corpus
    .command("inspect")
    .description("count, route and redact a traffic file without comparing contracts (prints no traffic values)")
    .argument("<file>", "drift-traffic/v1 JSONL or a .har file")
    .option("--spec <spec>", "route records against this contract")
    .addOption(refRootOption())
    .addOption(formatOption())
    .action(async (file: string, options: { spec?: string; refRoot?: string; format: "text" | "json" }) => {
      result.exitCode = await corpusInspectCommand(file, options, io, cwd);
    });

  program.action(() => {
    // Running `drift` with no command is a usage error: show help on stderr.
    program.help({ error: true });
  });

  return program;
}

/**
 * Runs the CLI and returns the documented exit code instead of exiting,
 * so the same function serves the binary and the tests.
 */
export async function runCli(args: readonly string[], io: CliIo, cwd: string = process.cwd()): Promise<ExitCode> {
  const result: { exitCode: ExitCode } = { exitCode: ExitCode.Pass };
  const program = createProgram(io, result, cwd);
  try {
    await program.parseAsync(args, { from: "user" });
    return result.exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander reports --help and --version as exit code 0; everything else is a usage error.
      return error.exitCode === 0 ? ExitCode.Pass : ExitCode.UsageError;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`drift: internal error: ${message}\n`);
    return ExitCode.InternalError;
  }
}
