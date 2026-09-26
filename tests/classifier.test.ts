import { describe, it, expect } from "vitest";
import { classify, summarizeSeverity, TO_DB, FROM_DB } from "../lib/classifier";

describe("DRIFT Contract Classifier Unit Tests", () => {
  it("classifies non-breaking changes as SAFE", () => {
    const result = classify("OPTIONAL_PARAM_ADDED", { total: 100, failed: 0 });
    expect(result).toBe("SAFE");
  });

  it("classifies structural breaking change with 0 failed replay traffic as RISKY", () => {
    const result = classify("FIELD_TYPE_CHANGED", { total: 50, failed: 0 });
    expect(result).toBe("RISKY");
  });

  it("classifies structural breaking change with failing replay traffic as BREAKING", () => {
    const result = classify("ENDPOINT_REMOVED", { total: 100, failed: 12 });
    expect(result).toBe("BREAKING");
  });

  it("classifies REQUIRED_PARAM_ADDED with failing replay traffic as BREAKING", () => {
    const result = classify("REQUIRED_PARAM_ADDED", { total: 10, failed: 1 });
    expect(result).toBe("BREAKING");
  });

  it("correctly maps canonical severity to DB Prisma enum values", () => {
    expect(TO_DB.SAFE).toBe("PASSED");
    expect(TO_DB.RISKY).toBe("WARNING");
    expect(TO_DB.BREAKING).toBe("CRITICAL_BREAKING");

    expect(FROM_DB.PASSED).toBe("SAFE");
    expect(FROM_DB.WARNING).toBe("RISKY");
    expect(FROM_DB.CRITICAL_BREAKING).toBe("BREAKING");
  });

  it("summarizes array of severities accurately", () => {
    expect(summarizeSeverity(["SAFE", "SAFE"])).toBe("SAFE");
    expect(summarizeSeverity(["SAFE", "RISKY"])).toBe("RISKY");
    expect(summarizeSeverity(["SAFE", "RISKY", "BREAKING"])).toBe("BREAKING");
  });
});
