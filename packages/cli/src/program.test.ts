import { ENGINE_VERSION } from "@drift/core";
import { ExitCode } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { runCli } from "./program.ts";
import { CLI_VERSION } from "./version.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) },
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}

describe("drift CLI", () => {
  it("prints the CLI and engine versions and exits 0", async () => {
    const c = capture();
    expect(await runCli(["--version"], c.io)).toBe(ExitCode.Pass);
    expect(c.stdout()).toBe(`${CLI_VERSION} (engine ${ENGINE_VERSION})\n`);
  });

  it("prints help to stdout and exits 0", async () => {
    const c = capture();
    expect(await runCli(["--help"], c.io)).toBe(ExitCode.Pass);
    expect(c.stdout()).toContain("Usage: drift");
    expect(c.stdout()).toContain("Evidence-based API contract compatibility gate");
  });

  it("treats no command as a usage error and prints help to stderr", async () => {
    const c = capture();
    expect(await runCli([], c.io)).toBe(ExitCode.UsageError);
    expect(c.stderr()).toContain("Usage: drift");
  });

  it("treats an unknown option as a usage error", async () => {
    const c = capture();
    expect(await runCli(["--no-such-option"], c.io)).toBe(ExitCode.UsageError);
    expect(c.stderr()).toContain("unknown option");
  });

  it("treats an unknown command as a usage error", async () => {
    const c = capture();
    expect(await runCli(["no-such-command"], c.io)).toBe(ExitCode.UsageError);
  });

  it("maps unexpected failures to the internal-error exit code", async () => {
    const err: string[] = [];
    const io = {
      stdout: () => {
        throw new Error("stdout closed");
      },
      stderr: (text: string) => err.push(text),
    };
    expect(await runCli(["--version"], io)).toBe(ExitCode.InternalError);
    expect(err.join("")).toBe("drift: internal error: stdout closed\n");
  });
});
