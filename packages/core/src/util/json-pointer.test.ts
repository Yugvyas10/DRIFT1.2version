import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { escapeToken, getAtTokens, parsePointer, toPointer, unescapeToken } from "./json-pointer.ts";

describe("JSON pointers (RFC 6901)", () => {
  it("escapes ~ and / in the right order", () => {
    expect(escapeToken("a/b~c")).toBe("a~1b~0c");
    expect(unescapeToken("a~1b~0c")).toBe("a/b~c");
    expect(unescapeToken("~01")).toBe("~1");
  });

  it("round-trips any list of tokens", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (tokens) => {
        expect(parsePointer(toPointer(tokens))).toEqual(tokens);
      })
    );
  });

  it("parses the whole document and rejects pointers without a leading slash", () => {
    expect(parsePointer("")).toEqual([]);
    expect(parsePointer("paths")).toBeUndefined();
  });

  it("percent-decodes URI fragments, and rejects malformed ones", () => {
    expect(parsePointer("/paths/~1pets~1%7Bid%7D", true)).toEqual(["paths", "/pets/{id}"]);
    expect(parsePointer("/bad/%E0%A4%A", true)).toBeUndefined();
  });

  it("follows tokens through objects and arrays", () => {
    const doc = { a: [{ b: 1 }], "x/y": 2 };
    expect(getAtTokens(doc, ["a", "0", "b"])).toEqual({ found: true, value: 1 });
    expect(getAtTokens(doc, ["x/y"])).toEqual({ found: true, value: 2 });
    expect(getAtTokens(doc, ["a", "01"])).toEqual({ found: false });
    expect(getAtTokens(doc, ["a", "5"])).toEqual({ found: false });
    expect(getAtTokens(doc, ["missing"])).toEqual({ found: false });
    expect(getAtTokens(doc, ["a", "0", "b", "c"])).toEqual({ found: false });
  });

  it("never reads inherited properties", () => {
    expect(getAtTokens({}, ["constructor"])).toEqual({ found: false });
    expect(getAtTokens({}, ["__proto__"])).toEqual({ found: false });
  });
});
