import { describe, expect, it } from "vitest";
import { RULES_FORMAT, RuleId } from "./rule-id.ts";

describe("rules vocabulary", () => {
  it("identifies the rules document format", () => {
    expect(RULES_FORMAT).toBe("drift-rules/v1");
  });

  it.each(["DRIFT-REQ-ENUM-REMOVED", "DRIFT-RESP-STATUS-ADDED", "DRIFT-X", "DRIFT-OP-2XX"])(
    "accepts the rule id %s",
    (id) => {
      expect(RuleId.parse(id)).toBe(id);
    }
  );

  it.each(["", "DRIFT", "DRIFT-", "drift-req-enum", "DRIFT-REQ--X", "DRIFT-REQ_ENUM", "X-DRIFT-REQ"])(
    "rejects the malformed rule id %j",
    (id) => {
      expect(RuleId.safeParse(id).success).toBe(false);
    }
  );
});
