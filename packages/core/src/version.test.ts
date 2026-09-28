import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_NAME, ENGINE_VERSION } from "./version.ts";

describe("engine version", () => {
  it("matches the package.json version so cache keys change on every release", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(ENGINE_VERSION).toBe(manifest.version);
  });

  it("has a stable engine name", () => {
    expect(ENGINE_NAME).toBe("drift-engine");
  });
});
