import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jsonSchemas } from "./json-schema.ts";
import { ClassifiedChange, Report } from "./report.ts";
import { TrafficRecord } from "./traffic.ts";

const hash = "a".repeat(64);
const spec = { file: "v1.yaml", oasVersion: "3.0.3", title: "Pets", version: "1", specHash: hash, operations: 2 };

const classified = {
  id: "0123456789abcdef",
  kind: "schema.enum.value_removed",
  direction: "request",
  operation: "POST /pets",
  location: "#/components/schemas/Pet/properties/status/enum",
  side: "base",
  subject: '"pending"',
  candidateSeverity: "RISKY",
  message: 'Enum value "pending" was removed',
  severity: "BREAKING",
  ruleId: "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED",
  rationale: "Clients may still send the removed value.",
  confidence: 1,
  unverified: false,
  evidence: {
    status: "failing",
    checked: { recorded: 3, synthetic: 0 },
    failed: { recorded: 1, synthetic: 0 },
    unknown: 0,
    examples: [
      {
        sample: "r:4",
        origin: "recorded",
        line: 4,
        payload: { method: "POST", path: "/pets", body: { status: "pending" } },
        redacted: [],
        errors: [{ pointer: "/body/status", keyword: "enum", message: "must be equal to one of the allowed values" }],
      },
    ],
  },
} as const;

const report = {
  format: "drift-report/v1",
  engine: { name: "drift", version: "0.0.0" },
  rules: { version: "1.0.0", hash },
  policy: { hash, failOn: "breaking" },
  base: spec,
  head: spec,
  corpus: {
    source: { kind: "jsonl", file: "traffic.jsonl" },
    recorded: {
      read: 5,
      malformed: 1,
      malformedExamples: [{ line: 2, reason: "not JSON" }],
      unrouted: 0,
      outOfScope: 1,
      sampled: 3,
      perOperationCap: 1000,
      totalCap: 50000,
    },
    synthetic: { generated: 0, discarded: 0, seed: 0 },
    redaction: { samples: 1, values: 2 },
    coverage: { affectedOperations: 1, withRecordedSamples: 1 },
  },
  changes: [classified],
  unattributed: [],
  nonConformance: { requests: 0, responses: 0 },
  summary: { breaking: 1, risky: 0, safe: 0, suppressed: 0 },
  semver: "major",
  gate: { failOn: "breaking", passed: false },
  stages: [{ stage: "diff", hash, cached: false }],
  diagnostics: [],
} as const;

describe("Report", () => {
  it("accepts a complete report", () => {
    expect(Report.parse(report)).toEqual(report);
  });

  it("rejects a confidence outside [0, 1] and an unknown evidence status", () => {
    expect(ClassifiedChange.safeParse({ ...classified, confidence: 1.5 }).success).toBe(false);
    expect(ClassifiedChange.safeParse({ ...classified, confidence: null }).success).toBe(true);
    const evidence = { ...classified.evidence, status: "maybe" };
    expect(ClassifiedChange.safeParse({ ...classified, evidence }).success).toBe(false);
  });
});

describe("TrafficRecord", () => {
  it("accepts a minimal and a full record", () => {
    expect(TrafficRecord.parse({ method: "GET", path: "/pets" })).toEqual({ method: "GET", path: "/pets" });
    const full = {
      method: "post",
      path: "/pets?x=1",
      query: { tag: ["a", "b"] },
      headers: { "Content-Type": "application/json" },
      requestBody: { name: "Rex" },
      status: 201,
      responseHeaders: {},
      responseBody: null,
      timestamp: "2026-09-28T10:00:00+05:30",
      clientId: "mobile",
    };
    expect(TrafficRecord.parse(full)).toEqual(full);
  });

  it("rejects unknown fields, relative paths and impossible statuses", () => {
    expect(TrafficRecord.safeParse({ method: "GET", path: "/p", reqestBody: {} }).success).toBe(false);
    expect(TrafficRecord.safeParse({ method: "GET", path: "pets" }).success).toBe(false);
    expect(TrafficRecord.safeParse({ method: "GET", path: "/p", status: 42 }).success).toBe(false);
  });
});

describe("published JSON Schemas", () => {
  // Regenerate with UPDATE_GOLDEN=1 and review the diff.
  it.each(Object.entries(jsonSchemas()))("schemas/%s matches the zod types", (name, schema) => {
    const file = new URL(`../schemas/${name}`, import.meta.url);
    const text = `${JSON.stringify(schema, null, 2)}\n`;
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(file, text);
    expect(readFileSync(file, "utf8")).toBe(text);
  });
});
