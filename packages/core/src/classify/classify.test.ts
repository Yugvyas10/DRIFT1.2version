import type { CHANGE_KINDS } from "@drift/report-schema";
import { type Change } from "@drift/report-schema";
import { DEFAULT_POLICY, DEFAULT_RULESET, findRule, occursIn, type Policy } from "@drift/rules";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Evidence } from "../verify/verify.ts";
import { assess, classify, globMatch } from "./classify.ts";

const parameters = DEFAULT_RULESET.confidence;
const evidence = (checked: [number, number], failed: [number, number], unknown = 0): Evidence => ({
  checked: { recorded: checked[0], synthetic: checked[1] },
  failed: { recorded: failed[0], synthetic: failed[1] },
  unknown,
  examples: [],
});
const rule = (kind: (typeof CHANGE_KINDS)[number], direction: "request" | "response" = "request") =>
  findRule(DEFAULT_RULESET, kind, direction);

function change(kind: Change["kind"], id: string, overrides: Partial<Change> = {}): Change {
  return {
    id,
    kind,
    direction: occursIn(kind)[0] ?? "request",
    operation: "POST /pets",
    location: "#/components/schemas/Pet",
    side: "head",
    candidateSeverity: "RISKY",
    message: kind,
    ...overrides,
  };
}

describe("assess (the confidence formula, ADR-0002)", () => {
  const enumRemoved = rule("schema.enum.value_removed");

  it("gives recorded failing evidence confidence 1", () => {
    expect(assess(enumRemoved, evidence([5, 0], [1, 0]), parameters)).toEqual({
      status: "failing",
      confidence: 1,
      unverified: false,
    });
  });

  it("gives synthetic-only failing evidence less, falling as recorded samples pass", () => {
    const none = assess(enumRemoved, evidence([0, 10], [0, 2]), parameters);
    const some = assess(enumRemoved, evidence([20, 10], [0, 2]), parameters);
    expect(none).toEqual({ status: "failing", confidence: 0.8, unverified: true });
    expect(some).toEqual({ status: "failing", confidence: 0.4, unverified: false });
  });

  it("uses the rule of three when nothing fails, and 0 without recorded samples", () => {
    expect(assess(enumRemoved, evidence([300, 0], [0, 0]), parameters).confidence).toBe(0.99);
    expect(assess(enumRemoved, evidence([2, 0], [0, 0]), parameters).confidence).toBe(0);
    expect(assess(enumRemoved, evidence([0, 7], [0, 0]), parameters)).toEqual({
      status: "passing",
      confidence: 0,
      unverified: true,
    });
    expect(assess(enumRemoved, evidence([0, 0], [0, 0]), parameters)).toEqual({
      status: "no_samples",
      confidence: 0,
      unverified: true,
    });
  });

  it("has no confidence for changes samples cannot prove", () => {
    expect(assess(rule("response.status.removed", "response"), evidence([3, 0], [0, 0]), parameters)).toEqual({
      status: "not_verifiable",
      confidence: null,
      unverified: false,
    });
  });
});

describe("classify", () => {
  const changes = [
    change("schema.enum.value_removed", "0000000000000001"),
    change("schema.enum.value_removed", "0000000000000002", { operation: "GET /pets" }),
    change("operation.deprecated", "0000000000000003", { operation: "GET /old" }),
    change("path.added", "0000000000000004", { operation: "GET /new" }),
  ];
  const input = (policy: Policy = DEFAULT_POLICY) => ({
    changes,
    evidence: { "0000000000000001": evidence([2, 0], [1, 0]) },
    ruleset: DEFAULT_RULESET,
    policy,
    asOf: "2026-09-28",
  });

  it("labels failing evidence BREAKING, dangerous changes RISKY and safe ones SAFE", () => {
    const result = classify(input());
    expect(result.changes.map((c) => [c.id, c.severity, c.ruleId])).toEqual([
      ["0000000000000001", "BREAKING", "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED"],
      ["0000000000000002", "RISKY", "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED"],
      ["0000000000000003", "SAFE", "DRIFT-REQ-OPERATION-DEPRECATED"],
      ["0000000000000004", "SAFE", "DRIFT-REQ-PATH-ADDED"],
    ]);
    expect(result.summary).toEqual({ breaking: 1, risky: 1, safe: 2, suppressed: 0 });
    expect(result.semver).toBe("major");
    expect(result.gate).toEqual({ failOn: "breaking", passed: false });
    expect(result.changes[1]?.evidence.status).toBe("no_samples");
  });

  it("escalates SAFE to RISKY by policy, and never lowers a label", () => {
    const result = classify(
      input({
        format: "drift-policy/v1",
        escalate: [
          { kind: "operation.deprecated", reason: "Deprecated operations are removed after one release" },
          { ruleId: "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED", direction: "response", reason: "not this direction" },
        ],
      })
    );
    expect(result.changes[2]).toMatchObject({
      severity: "RISKY",
      escalation: "Deprecated operations are removed after one release",
    });
    expect(result.changes[3]?.escalation).toBeUndefined();
  });

  it("applies suppressions by id or by rule and glob, ignores expired ones and reports unused ones", () => {
    const result = classify(
      input({
        format: "drift-policy/v1",
        failOn: "risky",
        suppressions: [
          { changeId: "0000000000000001", reason: "Agreed with the only client", expiresAt: "2026-12-31" },
          {
            ruleId: "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED",
            operation: "GET *",
            location: "#/components/*",
            reason: "Nobody filters by this value",
            expiresAt: "2026-09-28",
          },
          { changeId: "00000000000000ff", reason: "Old suppression long gone", expiresAt: "2026-01-01" },
          { ruleId: "DRIFT-REQ-PATH-REMOVED", reason: "Nothing is removed here", expiresAt: "2027-01-01" },
        ],
      })
    );
    expect(result.changes.map((c) => c.suppression?.reason)).toEqual([
      "Agreed with the only client",
      "Nobody filters by this value",
      undefined,
      undefined,
    ]);
    expect(result.summary).toEqual({ breaking: 0, risky: 0, safe: 2, suppressed: 2 });
    expect(result.gate).toEqual({ failOn: "risky", passed: true });
    expect(result.semver).toBe("major");
    expect(result.diagnostics.map((d) => [d.level, d.code])).toEqual([
      ["warning", "SUPPRESSION_EXPIRED"],
      ["info", "SUPPRESSION_UNUSED"],
    ]);
  });

  it("fails on RISKY when asked, and recommends minor or patch when nothing is dangerous", () => {
    expect(classify({ ...input(), failOn: "risky", evidence: {} }).gate).toEqual({ failOn: "risky", passed: false });
    const additive = classify({ ...input(), changes: changes.slice(3), evidence: {} });
    expect(additive.semver).toBe("minor");
    const docs = classify({ ...input(), changes: [change("doc.changed", "0000000000000009")], evidence: {} });
    expect(docs.semver).toBe("patch");
    const noMajor = classify({ ...input({ format: "drift-policy/v1", riskyIsMajor: false }), evidence: {} });
    expect(noMajor.semver).toBe("minor");
  });

  // M2 acceptance: missing evidence never produces SAFE.
  it("never labels a structurally dangerous change SAFE without failing evidence (property)", () => {
    const dangerous = DEFAULT_RULESET.rules.filter((r) => r.structural === "dangerous");
    fc.assert(
      fc.property(
        fc.constantFrom(...dangerous),
        fc.nat(1000),
        fc.nat(1000),
        fc.nat(50),
        (r, recorded, synthetic, unknown) => {
          const c = change(r.kind, "0123456789abcdef", { direction: r.direction });
          const result = classify({
            changes: [c],
            evidence: { [c.id]: evidence([recorded, synthetic], [0, 0], unknown) },
            ruleset: DEFAULT_RULESET,
            policy: DEFAULT_POLICY,
            asOf: "2026-09-28",
          });
          return result.changes[0]?.severity === "RISKY";
        }
      )
    );
  });
});

describe("globMatch", () => {
  it("treats * as any text and everything else literally", () => {
    expect(globMatch("GET *", "GET /pets/{}")).toBe(true);
    expect(globMatch("#/a.b/*", "#/a.b/c")).toBe(true);
    expect(globMatch("#/a.b/*", "#/axb/c")).toBe(false);
    expect(globMatch("exact", "exact")).toBe(true);
    expect(globMatch("exact", "exactly")).toBe(false);
  });
});
