import { describe, expect, it } from "vitest";
import { duration } from "./duration.ts";

describe("duration", () => {
  it("writes a time limit the way people read it", () => {
    expect(duration(300)).toBe("300 ms");
    expect(duration(45_000)).toBe("45 s");
    expect(duration(90_500)).toBe("91 s");
    expect(duration(600_000)).toBe("10 min");
  });
});
