import { CHANGE_KINDS } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { candidateSeverity, STRUCTURAL_DEFAULTS } from "./structural.ts";

describe("structural defaults", () => {
  it("covers every change kind and nothing else", () => {
    expect(Object.keys(STRUCTURAL_DEFAULTS).sort()).toEqual([...CHANGE_KINDS].sort());
  });

  it("encodes the direction rule: narrowing a request or widening a response is dangerous", () => {
    expect(candidateSeverity("schema.enum.value_removed", "request")).toBe("RISKY");
    expect(candidateSeverity("schema.enum.value_removed", "response")).toBe("SAFE");
    expect(candidateSeverity("schema.enum.value_added", "request")).toBe("SAFE");
    expect(candidateSeverity("schema.enum.value_added", "response")).toBe("RISKY");
    expect(candidateSeverity("schema.bound.tightened", "request")).toBe("RISKY");
    expect(candidateSeverity("schema.bound.relaxed", "response")).toBe("RISKY");
    expect(candidateSeverity("schema.property.made_optional", "response")).toBe("RISKY");
    expect(candidateSeverity("schema.property.added.required", "response")).toBe("SAFE");
  });

  it("never marks a documentation-only change as dangerous", () => {
    expect(candidateSeverity("doc.changed", "request")).toBe("SAFE");
    expect(candidateSeverity("doc.changed", "response")).toBe("SAFE");
  });

  it("treats every narrowing/widening pair as mirror images across directions", () => {
    const mirrors = [
      ["schema.type.narrowed", "schema.type.widened"],
      ["schema.enum.value_removed", "schema.enum.value_added"],
      ["schema.bound.tightened", "schema.bound.relaxed"],
      ["schema.additional_properties.tightened", "schema.additional_properties.relaxed"],
      ["schema.variant.removed", "schema.variant.added"],
    ] as const;
    for (const [narrow, widen] of mirrors) {
      expect(STRUCTURAL_DEFAULTS[narrow].request).toBe(STRUCTURAL_DEFAULTS[widen].response);
      expect(STRUCTURAL_DEFAULTS[narrow].response).toBe(STRUCTURAL_DEFAULTS[widen].request);
    }
  });
});
