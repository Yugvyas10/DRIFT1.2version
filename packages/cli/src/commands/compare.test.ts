import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ExitCode, Report } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { runCli } from "../program.ts";

/** Commands run with the repository root as the working directory, as a developer would. */
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const update = process.env.UPDATE_GOLDEN === "1";
const scratch = mkdtempSync(join(tmpdir(), "drift-compare-"));

async function drift(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, repo);
  return { code, stdout: out.join(""), stderr: err.join("") };
}

function file(name: string, content: string): string {
  const path = join(scratch, name);
  writeFileSync(path, content);
  return path;
}

const pets = ["--base", "examples/petstore/v1.yaml", "--head", "examples/petstore/v2-breaking.yaml"];
const traffic = ["--traffic", "examples/petstore/traffic.jsonl"];
const asOf = ["--as-of", "2026-09-28"];

describe("drift compare (golden, examples/petstore)", () => {
  it.each([
    ["expected.json", [...pets, ...traffic, ...asOf, "--format", "json"]],
    ["expected.txt", [...pets, ...traffic, ...asOf]],
    ["expected-synthetic.txt", [...pets, ...asOf]],
  ])("matches %s and exits 1 because the gate fails", async (golden, args) => {
    const result = await drift("compare", ...args);
    expect(result.code).toBe(ExitCode.GateFailed);
    expect(result.stderr).toBe("");
    const path = `${repo}examples/petstore/${golden}`;
    if (update) writeFileSync(path, result.stdout);
    expect(result.stdout).toBe(readFileSync(path, "utf8"));
    if (golden.endsWith(".json")) expect(Report.safeParse(JSON.parse(result.stdout)).success).toBe(true);
  });

  it("exits 0 for an additive change, and 1 for it only with --fail-on risky when something is RISKY", async () => {
    const additive = ["--base", "examples/petstore/v1.yaml", "--head", "examples/petstore/v2-additive.yaml"];
    expect((await drift("compare", ...additive, ...traffic, ...asOf)).code).toBe(ExitCode.Pass);
    const risky = await drift("compare", ...pets, ...traffic, ...asOf, "--fail-on", "risky", "--format", "json");
    expect((JSON.parse(risky.stdout) as Report).gate).toEqual({ failOn: "risky", passed: false });
  });
});

describe("drift compare: rules, policy and traffic files", () => {
  it("accepts a complete ruleset file and a policy that suppresses the breaks", async () => {
    const rules = "packages/rules/src/default-rules.json";
    const policy = file(
      "policy.yaml",
      [
        "format: drift-policy/v1",
        "suppressions:",
        "  - ruleId: DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED",
        "    reason: Clients were told in the release notes",
        "    expiresAt: 2026-12-31",
      ].join("\n")
    );
    const result = await drift("compare", ...pets, ...asOf, "--rules", rules, "--policy", policy, "--format", "json");
    const report = JSON.parse(result.stdout) as Report;
    expect(report.summary.suppressed).toBeGreaterThan(0);
    expect(report.changes.filter((change) => change.suppression).map((change) => change.kind)).toEqual(
      Array.from({ length: report.summary.suppressed }, () => "schema.enum.value_removed")
    );
  });

  it("reads HAR captures", async () => {
    const har = file(
      "capture.har",
      JSON.stringify({
        log: { entries: [{ request: { method: "DELETE", url: "https://api.example.com/v1/pets/7" } }] },
      })
    );
    const result = await drift("compare", ...pets, ...asOf, "--traffic", har, "--format", "json");
    const report = JSON.parse(result.stdout) as Report;
    expect(report.corpus.source.kind).toBe("har");
    expect(report.changes.find((change) => change.kind === "operation.removed")?.evidence.failed.recorded).toBe(1);
  });

  it.each([
    ["an invalid ruleset", ["--rules", "policy-as-rules.json"], /format: Invalid input/],
    ["an incomplete ruleset", ["--rules", "partial-rules.json"], /No rule for:/],
    ["a policy with a short reason", ["--policy", "bad-policy.json"], /suppressions\.0\.reason: Give a reason/],
    ["a YAML syntax error", ["--policy", "broken.yaml"], /SYNTAX_ERROR/],
    ["a HAR file that is not JSON", ["--traffic", "broken.har"], /not valid JSON/],
    ["a missing traffic file", ["--traffic", "missing.jsonl"], /cannot read .*missing\.jsonl \(ENOENT\)/],
    ["a bad seed", ["--seed", "x"], /--seed must be an integer/],
    ["a bad date", ["--as-of", "28/09/2026"], /--as-of must be a date/],
  ])("rejects %s with exit 2", async (_, extra, message) => {
    const rules = JSON.parse(readFileSync(`${repo}packages/rules/src/default-rules.json`, "utf8")) as {
      rules: { kind: string }[];
    };
    file("policy-as-rules.json", JSON.stringify({ format: "drift-policy/v1" }));
    file(
      "partial-rules.json",
      JSON.stringify({ ...rules, rules: rules.rules.filter((r) => r.kind !== "doc.changed") })
    );
    file(
      "bad-policy.json",
      JSON.stringify({
        format: "drift-policy/v1",
        suppressions: [{ changeId: "0123456789abcdef", reason: "ok", expiresAt: "2026-12-31" }],
      })
    );
    file("broken.yaml", "format: [unclosed\n");
    file("broken.har", "{not json");
    const args = extra.map((arg, index) =>
      index === 1 && !arg.startsWith("-") && extra[0] !== "--seed" && extra[0] !== "--as-of" ? join(scratch, arg) : arg
    );
    const result = await drift("compare", ...pets, ...args);
    expect(result.code).toBe(ExitCode.UsageError);
    expect(result.stderr).toMatch(message);
    expect(result.stdout).toBe("");
  });

  it("refuses to compare an invalid spec", async () => {
    const result = await drift(
      "compare",
      "--base",
      "examples/invalid/missing-info.yaml",
      "--head",
      "examples/petstore/v1.yaml"
    );
    expect(result.code).toBe(ExitCode.UsageError);
    expect(result.stderr).toContain("cannot compare");
  });
});
