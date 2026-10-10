import { ENGINE_VERSION } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { Command, CommanderError, Option } from "commander";
import { diffCommand } from "./commands/diff.ts";
import { validateCommand } from "./commands/validate.ts";
import { CLI_VERSION } from "./version.ts";

/** Where the CLI writes. Injected so tests can capture output without touching the process. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const formatOption = () => new Option("--format <format>", "output format").choices(["text", "json"]).default("text");
const refRootOption = () =>
  new Option("--ref-root <dir>", "directory that local $refs must stay inside (default: the spec's directory)");

/**
 * Builds the `drift` command tree. Commands are added milestone by milestone (PLAN §6):
 * `validate` and `diff` in M1, `compare` in M2, the full surface in M3.
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
    .description("list the structural changes between two specs (no evidence; see `compare` from M2)")
    .requiredOption("--base <spec>", "the old contract")
    .requiredOption("--head <spec>", "the new contract")
    .addOption(formatOption())
    .addOption(refRootOption())
    .action(async (options: { base: string; head: string; format: "text" | "json"; refRoot?: string }) => {
      result.exitCode = await diffCommand(options, io, cwd);
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
