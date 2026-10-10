import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "./version.ts";

describe("CLI version", () => {
  it("matches the package.json version", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(CLI_VERSION).toBe(manifest.version);
  });
});
