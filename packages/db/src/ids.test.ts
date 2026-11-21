import { describe, expect, it } from "vitest";
import { ID_PREFIXES, newId } from "./ids.ts";

describe("newId", () => {
  it("gives every model a prefixed, URL-safe, fixed-length id", () => {
    for (const kind of Object.keys(ID_PREFIXES) as (keyof typeof ID_PREFIXES)[]) {
      expect(newId(kind)).toMatch(new RegExp(`^${ID_PREFIXES[kind]}_[0-9a-z]{24}$`));
    }
    // The run id shape the API contract promises (apps/web/openapi/drift-api.yaml).
    expect(newId("run")).toMatch(/^run_[0-9a-z]{20,32}$/);
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 2000 }, () => newId("run"))).size).toBe(2000);
  });
});
