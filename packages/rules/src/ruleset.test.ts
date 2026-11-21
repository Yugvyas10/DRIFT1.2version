import { readFileSync, writeFileSync } from "node:fs";
import { ChangeKind } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import defaultRules from "./default-rules.json" with { type: "json" };
import { jsonSchemas } from "./json-schema.ts";
import { DEFAULT_POLICY, Policy } from "./policy.ts";
import { candidateSeverity, DEFAULT_RULESET, findRule, occursIn, parseRuleset, Ruleset } from "./ruleset.ts";

describe("the default ruleset", () => {
  it("has one rule for every (kind, direction) the diff stage can produce, and no other", () => {
    const expected = ChangeKind.options.flatMap((kind) => occursIn(kind).map((direction) => `${kind} ${direction}`));
    const actual = DEFAULT_RULESET.rules.map((rule) => `${rule.kind} ${rule.direction}`);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("derives every rule id from its kind and direction", () => {
    for (const rule of DEFAULT_RULESET.rules) {
      const prefix = rule.direction === "request" ? "REQ" : "RES";
      expect(rule.id).toBe(`DRIFT-${prefix}-${rule.kind.replace(/[._]/g, "-").toUpperCase()}`);
    }
  });

  // Narrowing what the server accepts is dangerous in requests; widening what it returns is dangerous in responses.
  it.each([
    ["schema.type.narrowed", "schema.type.widened"],
    ["schema.enum.value_removed", "schema.enum.value_added"],
    ["schema.bound.tightened", "schema.bound.relaxed"],
    ["schema.additional_properties.tightened", "schema.additional_properties.relaxed"],
    ["schema.variant.removed", "schema.variant.added"],
    ["schema.property.made_required", "schema.property.made_optional"],
  ] as const)("is direction-symmetric for %s / %s", (narrowing, widening) => {
    expect(candidateSeverity(narrowing, "request")).toBe("RISKY");
    expect(candidateSeverity(narrowing, "response")).toBe("SAFE");
    expect(candidateSeverity(widening, "request")).toBe("SAFE");
    expect(candidateSeverity(widening, "response")).toBe("RISKY");
  });

  it("never marks a documentation-only change as dangerous, verifiable or additive", () => {
    for (const direction of ["request", "response"] as const) {
      expect(findRule(DEFAULT_RULESET, "doc.changed", direction)).toMatchObject({
        structural: "safe",
        verifiable: false,
        additive: false,
      });
    }
  });

  it("is the file on disk, unchanged by parsing", () => {
    expect(DEFAULT_RULESET).toEqual(defaultRules);
  });
});

describe("parseRuleset", () => {
  const base = structuredClone(defaultRules);

  it("rejects duplicate ids and two rules for the same slot", () => {
    const duplicated = structuredClone(base);
    const [first] = duplicated.rules;
    if (!first) throw new Error("empty ruleset");
    duplicated.rules.push({ ...first });
    const result = Ruleset.safeParse(duplicated);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      `Duplicate rule id ${first.id}`,
      `Two rules for ${first.kind} ${first.direction}`,
    ]);
  });

  it("rejects a ruleset that leaves a change kind unclassified", () => {
    const partial = { ...structuredClone(base), rules: base.rules.filter((rule) => rule.kind !== "param.removed") };
    expect(() => parseRuleset(partial)).toThrow(/No rule for: param\.removed \(request\)/);
    expect(() => parseRuleset(partial)).toThrow(z.ZodError);
    expect(() => findRule(Ruleset.parse(partial), "param.removed", "request")).toThrow(/No rule for param\.removed/);
  });

  it("rejects bad versions and confidence parameters outside their range", () => {
    expect(() => parseRuleset({ ...base, version: "one" })).toThrow(z.ZodError);
    expect(() => parseRuleset({ ...base, confidence: { ...base.confidence, syntheticFailing: 1 } })).toThrow(
      z.ZodError
    );
  });
});

describe("Policy", () => {
  it("accepts the default and a full policy", () => {
    expect(Policy.parse(DEFAULT_POLICY)).toEqual(DEFAULT_POLICY);
    const full = {
      format: "drift-policy/v1",
      failOn: "risky",
      riskyIsMajor: false,
      escalate: [{ kind: "operation.deprecated", reason: "We remove deprecated operations after one release" }],
      suppressions: [
        { changeId: "0123456789abcdef", reason: "Agreed with the only client", expiresAt: "2026-12-31" },
        {
          ruleId: "DRIFT-RES-SCHEMA-ENUM-VALUE-ADDED",
          location: "#/components/schemas/Pet/*",
          reason: "Clients ignore unknown enum values",
          expiresAt: "2027-01-31",
        },
      ],
    };
    expect(Policy.parse(full)).toEqual(full);
  });

  it("requires a target, a real reason and a date for suppressions", () => {
    const suppression = { reason: "Agreed with the only client", expiresAt: "2026-12-31" };
    const policy = (entry: object) => ({ format: "drift-policy/v1", suppressions: [entry] });
    expect(Policy.safeParse(policy(suppression)).success).toBe(false);
    expect(Policy.safeParse(policy({ ...suppression, changeId: "0123456789abcdef", reason: "ok" })).success).toBe(
      false
    );
    expect(Policy.safeParse(policy({ ...suppression, changeId: "0123456789abcdef", expiresAt: "soon" })).success).toBe(
      false
    );
  });

  it("requires a target for escalations and never allows another format", () => {
    expect(Policy.safeParse({ format: "drift-policy/v1", escalate: [{ reason: "x" }] }).success).toBe(false);
    expect(Policy.safeParse({ format: "drift-policy/v2" }).success).toBe(false);
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
