import { ENGINE_VERSION } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { Command, CommanderError } from "commander";
import { CLI_VERSION } from "./version.ts";

/** Where the CLI writes. Injected so tests can capture output without touching the process. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * Builds the `drift` command tree. Commands are added milestone by milestone (PLAN §6):
 * `validate` and `diff` in M1, `compare` in M2, the full surface in M3.
 */
export function createProgram(io: CliIo): Command {
  const program = new Command("drift")
    .description("Evidence-based API contract compatibility gate for CI/CD.")
    .version(`${CLI_VERSION} (engine ${ENGINE_VERSION})`, "-v, --version", "print the CLI and engine versions")
    .helpOption("-h, --help", "show help")
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .showHelpAfterError()
    .exitOverride();

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
export async function runCli(args: readonly string[], io: CliIo): Promise<ExitCode> {
  const program = createProgram(io);
  try {
    await program.parseAsync(args, { from: "user" });
    return ExitCode.Pass;
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
