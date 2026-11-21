import { describe, expect, it } from "vitest";
import { commentKey, InputError, parseInputs } from "./inputs.ts";

const from = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("parseInputs", () => {
  it("applies the defaults of action.yml", () => {
    expect(parseInputs(from({ spec: " openapi.yaml " }))).toEqual({
      spec: "openapi.yaml",
      comment: true,
      sarif: false,
      upload: false,
      baseMissing: "pass",
      commentKey: "openapi.yaml",
      workingDirectory: ".",
    });
  });

  it("reads every input", () => {
    const inputs = parseInputs(
      from({
        base: "origin/main:api.yaml",
        head: "api.yaml",
        traffic: "t.jsonl",
        rules: "r.json",
        policy: "p.yaml",
        config: "drift.config.json",
        "fail-on": "risky",
        comment: "false",
        sarif: "true",
        upload: "true",
        project: "orders",
        "api-url": "https://drift.example",
        "api-key": "drift_test",
        "base-missing": "fail",
        "comment-key": "public api",
        "working-directory": "services/a",
      })
    );
    expect(inputs).toMatchObject({
      base: "origin/main:api.yaml",
      head: "api.yaml",
      traffic: "t.jsonl",
      rules: "r.json",
      policy: "p.yaml",
      config: "drift.config.json",
      failOn: "risky",
      comment: false,
      sarif: true,
      upload: true,
      project: "orders",
      apiUrl: "https://drift.example",
      apiKey: "drift_test",
      baseMissing: "fail",
      commentKey: "public_api",
      workingDirectory: "services/a",
    });
  });

  it("refuses values action.yml does not allow", () => {
    expect(() => parseInputs(from({ comment: "yes" }))).toThrow(InputError);
    expect(() => parseInputs(from({ "fail-on": "safe" }))).toThrow(/must be one of breaking, risky/);
    expect(() => parseInputs(from({ "base-missing": "skip" }))).toThrow(/pass, fail/);
    // upload needs to know where to, and with which key.
    expect(() => parseInputs(from({ upload: "true" }))).toThrow(/input "upload" needs the input "project"/);
    expect(() => parseInputs(from({ upload: "true", project: "p", "api-url": "https://x.example" }))).toThrow(
      /needs the input "api-key"/
    );
    // Without upload, the platform inputs are not read at all.
    expect(parseInputs(from({ "api-key": "drift_test" })).apiKey).toBeUndefined();
  });

  it("keeps comment keys to characters that cannot break the marker", () => {
    expect(commentKey("a b-->c")).toBe("a_b--_c");
    expect(commentKey("x".repeat(300))).toHaveLength(200);
    expect(parseInputs(from({})).commentKey).toBe("drift");
  });
});
