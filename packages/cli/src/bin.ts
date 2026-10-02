#!/usr/bin/env node
import { runCli } from "./program.ts";

// Colour only on a terminal, never when NO_COLOR is set (https://no-color.org); FORCE_COLOR turns it on.
const color =
  process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0"
    ? true
    : process.stdout.isTTY && (process.env.NO_COLOR ?? "") === "";

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  color,
  env: process.env,
  fetch: globalThis.fetch,
});
