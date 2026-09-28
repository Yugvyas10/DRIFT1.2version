import { describe, expect, it } from "vitest";
import { Direction, ExitCode, FailOn, REPORT_SCHEMA_ID, Severity } from "./index.ts";

describe("report vocabulary", () => {
  it("identifies the report format", () => {
    expect(REPORT_SCHEMA_ID).toBe("drift-report/v1");
  });

  it("accepts exactly the three severities", () => {
    expect(Severity.options).toEqual(["BREAKING", "RISKY", "SAFE"]);
    expect(Severity.safeParse("BREAKING").success).toBe(true);
    expect(Severity.safeParse("breaking").success).toBe(false);
    expect(Severity.safeParse("WARNING").success).toBe(false);
  });

  it("accepts exactly the two directions", () => {
    expect(Direction.options).toEqual(["request", "response"]);
    expect(Direction.safeParse("both").success).toBe(false);
  });

  it("accepts the documented --fail-on values", () => {
    expect(FailOn.parse("breaking")).toBe("breaking");
    expect(FailOn.parse("risky")).toBe("risky");
    expect(FailOn.safeParse("safe").success).toBe(false);
  });

  it("uses the documented, distinct exit codes", () => {
    expect(ExitCode).toEqual({ Pass: 0, GateFailed: 1, UsageError: 2, InternalError: 3 });
  });
});
