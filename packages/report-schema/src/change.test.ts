import { describe, expect, it } from "vitest";
import { Change, CHANGE_KINDS, ChangeKind } from "./change.ts";
import { Diagnostic } from "./diagnostic.ts";
import { DiffOutput } from "./diff-output.ts";

const change = {
  id: "0123456789abcdef",
  kind: "schema.enum.value_removed",
  direction: "request",
  operation: "POST /pets",
  location: "#/components/schemas/Pet/properties/status/enum",
  side: "base",
  subject: '"sold"',
  before: "sold",
  candidateSeverity: "RISKY",
  message: 'Request enum value "sold" was removed',
} as const;

describe("Change", () => {
  it("accepts a well-formed change", () => {
    expect(Change.parse(change)).toEqual(change);
  });

  it("rejects unknown kinds, bad ids and BREAKING as a structural severity", () => {
    expect(Change.safeParse({ ...change, kind: "schema.renamed" }).success).toBe(false);
    expect(Change.safeParse({ ...change, id: "XYZ" }).success).toBe(false);
    expect(Change.safeParse({ ...change, candidateSeverity: "BREAKING" }).success).toBe(false);
  });

  it("lists every kind once", () => {
    expect(new Set(CHANGE_KINDS).size).toBe(CHANGE_KINDS.length);
    expect(ChangeKind.options).toEqual([...CHANGE_KINDS]);
  });
});

describe("Diagnostic and DiffOutput", () => {
  it("accepts a located diagnostic and rejects a zero line", () => {
    const d = { severity: "error", code: "OAS_SCHEMA", message: "x", file: "a.yaml", line: 3, column: 5 };
    expect(Diagnostic.parse(d)).toEqual(d);
    expect(Diagnostic.safeParse({ ...d, line: 0 }).success).toBe(false);
  });

  it("accepts a diff document", () => {
    const summary = {
      file: "a.yaml",
      oasVersion: "3.1.0",
      title: "t",
      version: "1",
      specHash: "a".repeat(64),
      operations: 1,
    };
    const doc = {
      format: "drift-diff/v1",
      engine: { name: "drift-engine", version: "0.0.0" },
      base: summary,
      head: summary,
      changes: [change],
      impact: { "POST /pets": [change.id] },
    };
    expect(DiffOutput.parse(doc)).toEqual(doc);
  });
});
