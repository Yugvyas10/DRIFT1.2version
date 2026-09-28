import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CHANGE_KINDS, type Change } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { ingestSpec } from "../ingest/ingest.ts";
import type { SpecReader } from "../ingest/types.ts";
import { diffSpecs } from "./diff.ts";

/**
 * Golden tests: every examples/diff/<case> pair must produce exactly the change set in expected.json.
 * After an intended behaviour change: UPDATE_GOLDEN=1 pnpm --filter @drift/core test, then review the diff.
 */
const examples = fileURLToPath(new URL("../../../../examples/diff/", import.meta.url));
const update = process.env.UPDATE_GOLDEN === "1";
const reader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};
const cases = readdirSync(examples, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function run(name: string): Promise<Change[]> {
  const dir = `${examples}${name}/`;
  const headFile = existsSync(`${dir}head.yaml`) ? "head.yaml" : "head.json";
  const [base, head] = await Promise.all([
    ingestSpec(`${dir}base.yaml`, { reader }),
    ingestSpec(`${dir}${headFile}`, { reader }),
  ]);
  if (!base.spec || !head.spec)
    throw new Error(`${name}: ${JSON.stringify([...base.diagnostics, ...head.diagnostics])}`);
  return diffSpecs(base.spec.ir, head.spec.ir).changes;
}

describe("golden diffs (examples/diff)", () => {
  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases)("%s", async (name) => {
    const changes = await run(name);
    const expectedFile = `${examples}${name}/expected.json`;
    if (update) writeFileSync(expectedFile, `${JSON.stringify(changes, null, 2)}\n`);
    expect(changes).toEqual(JSON.parse(readFileSync(expectedFile, "utf8")));
  });

  it("covers every change kind across the cases", () => {
    const seen = new Set<string>();
    for (const name of cases) {
      const expected = JSON.parse(readFileSync(`${examples}${name}/expected.json`, "utf8")) as Change[];
      expected.forEach((change) => seen.add(change.kind));
    }
    expect([...CHANGE_KINDS].filter((kind) => !seen.has(kind))).toEqual([]);
  });
});
