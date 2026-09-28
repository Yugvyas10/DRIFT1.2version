import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Runs the CLI. Tests never read or write a stage cache unless they ask for one. */
async function drift(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const cached = args.some((arg) => arg.startsWith("--cache"));
  const full = args[0] === "compare" && !cached ? [...args, "--no-cache"] : args;
  const code = await runCli(full, { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, repo);
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

  // M3 acceptance: every format at once, written to a directory; exit 1 because the gate fails.
  it("writes every report format with --out (goldens), and still prints the console report", async () => {
    const out = join(scratch, "out");
    const result = await drift(
      "compare",
      ...pets,
      ...traffic,
      ...asOf,
      "--format",
      "console,json,html,md,sarif,junit",
      "--out",
      out
    );
    expect(result.code).toBe(ExitCode.GateFailed);
    expect(result.stdout).toContain("✖ gate failed");
    expect(result.stdout).toMatch(/wrote .*drift-report\.txt, .*drift-report\.junit\.xml\n$/);
    expect(readdirSync(out).sort()).toEqual([
      "drift-report.html",
      "drift-report.json",
      "drift-report.junit.xml",
      "drift-report.md",
      "drift-report.sarif",
      "drift-report.txt",
    ]);
    expect(readFileSync(join(out, "drift-report.json"), "utf8")).toBe(
      readFileSync(`${repo}examples/petstore/expected.json`, "utf8")
    );
    for (const [written, golden] of [
      ["drift-report.txt", "expected.txt"],
      ["drift-report.md", "expected.md"],
      ["drift-report.html", "expected.html"],
      ["drift-report.sarif", "expected.sarif"],
      ["drift-report.junit.xml", "expected.junit.xml"],
    ] as const) {
      const text = readFileSync(join(out, written), "utf8");
      const path = `${repo}examples/petstore/${golden}`;
      if (update && golden !== "expected.txt") writeFileSync(path, text);
      expect(text, golden).toBe(readFileSync(path, "utf8"));
    }
    expect(readFileSync(join(out, "drift-report.html"), "utf8")).not.toMatch(/(?:src|href)=|https?:\/\//);
  });

  it("prints one format to stdout, and refuses several without --out or an unknown one", async () => {
    const md = await drift("compare", ...pets, ...traffic, ...asOf, "--format", "md");
    expect(md.stdout).toBe(readFileSync(`${repo}examples/petstore/expected.md`, "utf8"));
    const several = await drift("compare", ...pets, "--format", "json,md");
    expect(several).toMatchObject({ code: ExitCode.UsageError, stderr: "drift: several formats need --out <dir>\n" });
    const unknown = await drift("compare", ...pets, "--format", "pdf");
    expect(unknown.stderr).toMatch(/unknown format "pdf"/);
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
