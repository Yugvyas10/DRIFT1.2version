import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DiffOutput, ExitCode } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { runCli } from "../program.ts";

/** Commands run with the repository root as the working directory, as a developer would. */
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const update = process.env.UPDATE_GOLDEN === "1";

async function drift(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, repo);
  return { code, stdout: out.join(""), stderr: err.join("") };
}

const invalid = readdirSync(`${repo}examples/invalid`)
  .filter((f) => f.endsWith(".yaml"))
  .sort();
const diffCases = readdirSync(`${repo}examples/diff`, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe("drift validate", () => {
  it.each([
    "examples/valid/petstore-3.0.yaml",
    "examples/valid/petstore-3.1.yaml",
    "examples/valid/multi-file/openapi.yaml",
  ])("accepts %s with exit 0", async (spec) => {
    const result = await drift("validate", spec);
    expect(result.code).toBe(ExitCode.Pass);
    expect(result.stdout).toMatch(/^✔ .*: valid OpenAPI 3\.[01]\.\d \(\d+ operations?, 0 warnings\)\n$/);
  });

  it.each(invalid)("rejects examples/invalid/%s with located errors and exit 2 (golden)", async (file) => {
    const result = await drift("validate", `examples/invalid/${file}`);
    expect(result.code).toBe(ExitCode.UsageError);
    const golden = `${repo}examples/invalid/${file.replace(/\.yaml$/, ".expected.txt")}`;
    if (update) writeFileSync(golden, result.stdout);
    expect(result.stdout).toBe(readFileSync(golden, "utf8"));
  });

  it("prints JSON with --format json", async () => {
    const result = await drift("validate", "examples/invalid/remote-ref.yaml", "--format", "json");
    const parsed = JSON.parse(result.stdout) as { valid: boolean; diagnostics: { code: string }[] };
    expect(parsed.valid).toBe(false);
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(["REF_REMOTE_DISALLOWED"]);
    const valid = JSON.parse(
      (await drift("validate", "examples/valid/petstore-3.0.yaml", "--format", "json")).stdout
    ) as Record<string, unknown>;
    expect(valid).toMatchObject({ valid: true, oasVersion: "3.0.3", operations: 3 });
  });

  it("lets --ref-root widen where local references may point", async () => {
    const result = await drift("validate", "examples/invalid/ref-outside-root.yaml", "--ref-root", "examples");
    expect(result.code).toBe(ExitCode.Pass);
  });

  it("reports a missing file as a usage error", async () => {
    const result = await drift("validate", "does/not/exist.yaml");
    expect(result.code).toBe(ExitCode.UsageError);
    expect(result.stdout).toContain("FILE_READ_ERROR");
  });

  it("rejects an unknown --format", async () => {
    expect((await drift("validate", "examples/valid/petstore-3.0.yaml", "--format", "xml")).code).toBe(
      ExitCode.UsageError
    );
  });
});

describe("drift diff", () => {
  it.each(diffCases)("examples/diff/%s matches the golden change set", async (name) => {
    const head = existsSync(`${repo}examples/diff/${name}/head.yaml`) ? "head.yaml" : "head.json";
    const result = await drift(
      "diff",
      "--base",
      `examples/diff/${name}/base.yaml`,
      "--head",
      `examples/diff/${name}/${head}`,
      "--format",
      "json"
    );
    expect(result.code).toBe(ExitCode.Pass);
    const output = DiffOutput.parse(JSON.parse(result.stdout));
    expect(output.changes).toEqual(JSON.parse(readFileSync(`${repo}examples/diff/${name}/expected.json`, "utf8")));
    expect(output.base.file).toBe(`examples/diff/${name}/base.yaml`);
  });

  it("prints a readable summary by default", async () => {
    const result = await drift(
      "diff",
      "--base",
      "examples/diff/enums/base.yaml",
      "--head",
      "examples/diff/enums/head.yaml"
    );
    expect(result.code).toBe(ExitCode.Pass);
    expect(result.stdout).toContain("4 changes (3 RISKY, 1 SAFE) in 1 operation");
    expect(result.stdout).toContain('Enum value "shipped" was removed');
  });

  it("says so when nothing changed", async () => {
    const result = await drift(
      "diff",
      "--base",
      "examples/valid/petstore-3.0.yaml",
      "--head",
      "examples/valid/petstore-3.0.yaml"
    );
    expect(result.stdout).toContain("No changes.");
  });

  it("refuses to diff an invalid spec, with exit 2 and the errors on stderr", async () => {
    const result = await drift(
      "diff",
      "--base",
      "examples/valid/petstore-3.0.yaml",
      "--head",
      "examples/invalid/missing-info.yaml"
    );
    expect(result.code).toBe(ExitCode.UsageError);
    expect(result.stderr).toContain("examples/invalid/missing-info.yaml:1:1  error  OAS_SCHEMA");
    expect(result.stdout).toBe("");
  });

  it("requires --base and --head", async () => {
    expect((await drift("diff", "--base", "a.yaml")).code).toBe(ExitCode.UsageError);
  });
});
