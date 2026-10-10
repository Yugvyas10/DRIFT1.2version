import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "./version.ts";

const bin = fileURLToPath(new URL("./bin.ts", import.meta.url));

function drift(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

describe("drift binary", () => {
  it("exits 0 for --version", () => {
    const result = drift("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(CLI_VERSION);
  });

  it("exits 2 for a usage error", () => {
    expect(drift("--no-such-option").status).toBe(2);
  });
});
