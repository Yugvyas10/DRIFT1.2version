import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compare, ingestSpec, type SpecReader } from "@drift/core";
import type { Report } from "@drift/report-schema";

const petstore = fileURLToPath(new URL("../../../../../examples/petstore/", import.meta.url));
const reader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};

let cached: Promise<Report> | undefined;

/** A real drift-report/v1: the engine's output for examples/petstore (v1 → v2-breaking), not a hand-made fixture. */
export function petstoreReport(): Promise<Report> {
  cached ??= (async () => {
    const [base, head] = await Promise.all(
      ["v1.yaml", "v2-breaking.yaml"].map(async (name) => {
        const result = await ingestSpec(`${petstore}${name}`, {
          reader,
          displayPath: (path) => path.slice(petstore.length),
        });
        if (!result.spec) throw new Error(`${name} is invalid`);
        return result.spec;
      })
    );
    if (!base || !head) throw new Error("unreachable");
    return compare({ base, head, asOf: "2026-10-01" });
  })();
  return cached;
}
