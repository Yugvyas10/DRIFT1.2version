import { describe, expect, it } from "vitest";
import { PositionIndex } from "./positions.ts";

describe("PositionIndex", () => {
  const yaml =
    "openapi: 3.0.3\npaths:\n  /pets:\n    get:\n      responses:\n        200:\n          description: ok\n";

  it("locates values in YAML by reference tokens (1-based)", () => {
    const index = new PositionIndex(yaml);
    expect(index.locate(["paths", "/pets", "get"])).toEqual({ line: 5, column: 7 });
    expect(index.locate(["paths", "/pets", "get", "responses", "200", "description"])).toEqual({ line: 7, column: 24 });
  });

  it("falls back to the deepest existing ancestor", () => {
    const index = new PositionIndex(yaml);
    expect(index.locate(["paths", "/pets", "post"])).toEqual({ line: 4, column: 5 });
  });

  it("locates values in JSON and inside arrays", () => {
    const index = new PositionIndex('{\n  "tags": [\n    "a",\n    {"name": "b"}\n  ]\n}');
    expect(index.locate(["tags", "1", "name"])).toEqual({ line: 4, column: 14 });
    expect(index.locate(["tags", "9"])).toEqual({ line: 2, column: 11 });
  });

  it("returns the document start for the root", () => {
    expect(new PositionIndex(yaml).locate([])).toEqual({ line: 1, column: 1 });
  });
});
