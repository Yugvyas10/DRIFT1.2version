import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ExitCode, type ClassifiedChange, type Report } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { configJsonSchema } from "../config.ts";
import { runCli } from "../program.ts";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const update = process.env.UPDATE_GOLDEN === "1";
const scratch = mkdtempSync(join(tmpdir(), "drift-surface-"));

async function drift(cwd: string, args: string[], color = false) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { stdout: (t) => out.push(t), stderr: (t) => err.push(t), color }, cwd);
  return { code, stdout: out.join(""), stderr: err.join("") };
}

const pets = ["--base", "examples/petstore/v1.yaml", "--head", "examples/petstore/v2-breaking.yaml"];
const fixed = ["--as-of", "2026-09-28", "--no-cache"];

describe("drift explain", () => {
  it("explains one change, by id or unique prefix, from a fresh comparison or a saved report", async () => {
    const report = JSON.parse(readFileSync(`${repo}examples/petstore/expected.json`, "utf8")) as Report;
    const change = report.changes.find((c) => c.kind === "schema.enum.value_removed" && c.severity === "BREAKING");
    if (!change) throw new Error("no such change");
    const fromReport = await drift(repo, [
      "explain",
      change.id.slice(0, 8),
      "--report",
      "examples/petstore/expected.json",
    ]);
    expect(fromReport.code).toBe(ExitCode.Pass);
    const golden = `${repo}examples/petstore/expected-explain.txt`;
    if (update) writeFileSync(golden, fromReport.stdout);
    expect(fromReport.stdout).toBe(readFileSync(golden, "utf8"));
    const fresh = await drift(repo, [
      "explain",
      change.id,
      ...pets,
      "--traffic",
      "examples/petstore/traffic.jsonl",
      ...fixed,
      "--format",
      "json",
    ]);
    expect(JSON.parse(fresh.stdout) as ClassifiedChange).toEqual(change);
  });

  it("rejects unknown and ambiguous ids, and unreadable reports", async () => {
    const report = ["--report", "examples/petstore/expected.json"];
    expect((await drift(repo, ["explain", "ffffffffffffffff", ...report])).stderr).toMatch(/no change with id/);
    const saved = JSON.parse(readFileSync(`${repo}examples/petstore/expected.json`, "utf8")) as Report;
    const [first, second] = saved.changes;
    if (!first || !second) throw new Error("need two changes");
    const twins = {
      ...saved,
      changes: [
        { ...first, id: "aaaa000000000001" },
        { ...second, id: "aaaa000000000002" },
      ],
    };
    writeFileSync(join(scratch, "twins.json"), JSON.stringify(twins));
    expect((await drift(scratch, ["explain", "aaaa", "--report", "twins.json"])).stderr).toMatch(
      /"aaaa" matches 2 changes/
    );
    expect((await drift(repo, ["explain", "abcd", "--report", "examples/petstore/v1.yaml"])).stderr).toMatch(
      /cannot read .* as JSON/
    );
    writeFileSync(join(scratch, "not-a-report.json"), "{}");
    const invalid = await drift(scratch, ["explain", "abcd", "--report", "not-a-report.json"]);
    expect(invalid).toMatchObject({ code: ExitCode.UsageError, stderr: expect.stringMatching(/format: /) as unknown });
    expect((await drift(scratch, ["explain", "abcd"])).stderr).toMatch(/--base and --head are required/);
  });
});

describe("drift rules list", () => {
  it("lists the default rules, or a ruleset file, as text or JSON", async () => {
    const text = await drift(repo, ["rules", "list"]);
    expect(text.stdout).toMatch(/^drift-rules\/v1 1\.0\.0: 71 rules\n/);
    expect(text.stdout).toContain("DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED");
    const json = await drift(repo, [
      "rules",
      "list",
      "--rules",
      "packages/rules/src/default-rules.json",
      "--format",
      "json",
    ]);
    expect((JSON.parse(json.stdout) as { rules: unknown[] }).rules).toHaveLength(71);
    const bad = await drift(repo, ["rules", "list", "--rules", "examples/petstore/v1.yaml"]);
    expect(bad.code).toBe(ExitCode.UsageError);
  });
});

describe("drift corpus inspect", () => {
  it("counts, routes and redacts without printing any traffic value", async () => {
    const result = await drift(repo, [
      "corpus",
      "inspect",
      "examples/petstore/traffic.jsonl",
      "--spec",
      "examples/petstore/v1.yaml",
    ]);
    expect(result.code).toBe(ExitCode.Pass);
    const golden = `${repo}examples/petstore/expected-inspect.txt`;
    if (update) writeFileSync(golden, result.stdout);
    expect(result.stdout).toBe(readFileSync(golden, "utf8"));
    for (const secret of ["alice@example.com", "eyJhbGci", "4111", "gsk_", "bob@example.com"]) {
      expect(result.stdout).not.toContain(secret);
    }
    const raw = JSON.parse(
      (await drift(repo, ["corpus", "inspect", "examples/petstore/traffic.jsonl", "--format", "json"])).stdout
    ) as {
      operations: Record<string, number>;
      unrouted: number;
    };
    expect(raw.operations["GET /v1/unknown"]).toBe(1);
    expect(raw.unrouted).toBe(0);
    expect((await drift(repo, ["corpus", "inspect", "missing.jsonl"])).code).toBe(ExitCode.UsageError);
    expect(
      (
        await drift(repo, [
          "corpus",
          "inspect",
          "examples/petstore/traffic.jsonl",
          "--spec",
          "examples/invalid/missing-info.yaml",
        ])
      ).code
    ).toBe(ExitCode.UsageError);
  });
});

describe("drift.config", () => {
  function project(name: string, config: string) {
    const dir = join(scratch, name);
    mkdirSync(join(dir, "api"), { recursive: true });
    copyFileSync(`${repo}examples/petstore/v1.yaml`, join(dir, "api/v1.yaml"));
    copyFileSync(`${repo}examples/petstore/v2-breaking.yaml`, join(dir, "api/v2.yaml"));
    writeFileSync(join(dir, name.endsWith("yaml") ? "drift.config.yaml" : "drift.config.json"), config);
    return dir;
  }

  it("supplies defaults relative to the config file; flags win", async () => {
    const dir = project(
      "with-json",
      JSON.stringify({
        format: "drift-config/v1",
        base: "api/v1.yaml",
        head: "api/v2.yaml",
        formats: ["json"],
        failOn: "risky",
        cache: false,
      })
    );
    const result = await drift(dir, ["compare", "--as-of", "2026-09-28"]);
    expect(result.code).toBe(ExitCode.GateFailed);
    expect((JSON.parse(result.stdout) as Report).gate.failOn).toBe("risky");
    const flagged = await drift(dir, ["compare", "--as-of", "2026-09-28", "--format", "md", "--head", "api/v1.yaml"]);
    expect(flagged.code).toBe(ExitCode.Pass);
    expect(flagged.stdout).toContain("DRIFT: contract gate passed");
  });

  it("reads YAML, and reports invalid and unreadable configs", async () => {
    const dir = project("with-yaml", "format: drift-config/v1\nbase: api/v1.yaml\nhead: api/v1.yaml\ncache: false\n");
    expect((await drift(dir, ["compare"])).code).toBe(ExitCode.Pass);
    const bad = project("bad-json", JSON.stringify({ format: "drift-config/v1", base: 1 }));
    expect((await drift(bad, ["compare"])).stderr).toMatch(/drift\.config\.json: base: /);
    const broken = project("broken-yaml", "format: [\n");
    expect((await drift(broken, ["compare"])).stderr).toMatch(/drift\.config\.yaml:\d/);
    expect((await drift(scratch, ["compare", "--config", "nope.json"])).stderr).toMatch(/cannot read the config file/);
  });

  it("publishes a JSON Schema that matches the zod type", () => {
    const file = `${repo}packages/cli/schemas/drift-config-v1.schema.json`;
    const text = `${JSON.stringify(configJsonSchema(), null, 2)}\n`;
    if (update) {
      mkdirSync(`${repo}packages/cli/schemas`, { recursive: true });
      writeFileSync(file, text);
    }
    expect(readFileSync(file, "utf8")).toBe(text);
  });
});

describe("git revisions as specs", () => {
  it("compares a committed version (<ref>:<path>) with the working tree", async () => {
    const dir = join(scratch, "git-repo");
    mkdirSync(join(dir, "api"), { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    copyFileSync(`${repo}examples/petstore/v1.yaml`, join(dir, "api/openapi.yaml"));
    git("add", ".");
    git("commit", "-q", "-m", "v1");
    copyFileSync(`${repo}examples/petstore/v2-breaking.yaml`, join(dir, "api/openapi.yaml"));
    const result = await drift(join(dir, "api"), [
      "compare",
      "--base",
      "HEAD:openapi.yaml",
      "--head",
      "openapi.yaml",
      ...fixed,
      "--format",
      "json",
    ]);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as Report;
    expect(report.base.file).toBe("HEAD:api/openapi.yaml");
    expect(report.summary.breaking).toBeGreaterThan(0);

    const missing = await drift(dir, ["compare", "--base", "HEAD:nope.yaml", "--head", "api/openapi.yaml", ...fixed]);
    expect(missing.stderr).toMatch(/HEAD:nope\.yaml\s+error\s+FILE_READ_ERROR/);
    expect(
      (await drift(dir, ["compare", "--base", "no-such-ref:api/openapi.yaml", "--head", "api/openapi.yaml", ...fixed]))
        .stderr
    ).toMatch(/"no-such-ref" is not a revision/);
    expect(
      (await drift(dir, ["compare", "--base", "--upload-pack=x:y", "--head", "api/openapi.yaml", ...fixed])).stderr
    ).toMatch(/is not a git revision/);
  });
});

describe("cache and colour", () => {
  it("reuses stages on a re-run with unchanged inputs", async () => {
    const cache = join(scratch, "cache");
    const args = ["compare", ...pets, "--as-of", "2026-09-28", "--cache", cache];
    expect((await drift(repo, args)).stdout).not.toContain("cache  reused");
    expect((await drift(repo, args)).stdout).toContain(
      "cache  reused diff, corpus, verify, classify (inputs unchanged)"
    );
  });

  it("colours the console report only when the terminal allows it", async () => {
    const plain = await drift(repo, ["compare", ...pets, ...fixed]);
    const coloured = await drift(repo, ["compare", ...pets, ...fixed], true);
    expect(plain.stdout).not.toContain("\u001b[");
    expect(coloured.stdout).toContain("\u001b[31m");
  });
});
