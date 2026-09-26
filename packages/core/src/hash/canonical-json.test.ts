import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson, CanonicalJsonError } from "./canonical-json.ts";

describe("canonicalJson — RFC 8785 conformance", () => {
  it("canonicalises the RFC 8785 §3.2.4 example", () => {
    // The vector is built from BS (a single backslash) so its escape sequences are unambiguous.
    const BS = String.fromCharCode(92);
    const input = JSON.parse(
      `{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],` +
        `"string":"${BS}u20ac$${BS}u000F${BS}u000aA'${BS}u0042${BS}u0022${BS}u005c${BS}${BS}${BS}"${BS}/",` +
        `"literals":[null,true,false]}`
    ) as unknown;
    expect(canonicalJson(input)).toBe(
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],` +
        `"string":"€$${BS}u000f${BS}nA'B${BS}"${BS}${BS}${BS}${BS}${BS}"/"}`
    );
  });

  it("sorts keys by UTF-16 code units, not by code point (RFC 8785 §3.2.3)", () => {
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    };
    const keys = Object.keys(JSON.parse(canonicalJson(input)) as Record<string, string>);
    // Object.keys lists integer-like keys first, so compare the serialised order directly.
    const serialisedOrder = [...canonicalJson(input).matchAll(/"([^"]*)":"/g)].map((m) => m[1]);
    expect(serialisedOrder).toEqual([String.raw`\r`, "1", "\u0080", "ö", "€", "😀", "דּ"]);
    expect(keys).toHaveLength(7);
  });

  it.each([
    [0, "0"],
    [-0, "0"],
    [1, "1"],
    [-1.5, "-1.5"],
    [1e21, "1e+21"],
    [1e-7, "1e-7"],
    [0.000001, "0.000001"],
    [9007199254740992, "9007199254740992"],
    [5e-324, "5e-324"],
    [1.7976931348623157e308, "1.7976931348623157e+308"],
  ])("serialises the number %s as %s (ECMAScript number formatting)", (value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });

  it("serialises literals and nested containers without whitespace", () => {
    expect(canonicalJson({ b: [1, { d: null, c: true }], a: "x" })).toBe('{"a":"x","b":[1,{"c":true,"d":null}]}');
    expect(canonicalJson([])).toBe("[]");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson(false)).toBe("false");
  });

  it("accepts objects without a prototype", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.z = 1;
    bare.a = 2;
    expect(canonicalJson(bare)).toBe('{"a":2,"z":1}');
  });

  it("omits properties whose value is undefined", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("allows the same object to appear twice when it is not circular", () => {
    const shared = { k: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"k":1},"b":{"k":1}}');
  });
});

describe("canonicalJson — rejects values that are not JSON data", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  it.each<[string, unknown, string]>([
    ["NaN", Number.NaN, "$"],
    ["Infinity", { n: Number.POSITIVE_INFINITY }, "$.n"],
    ["bigint", [1n], "$[0]"],
    ["function", { f: () => 1 }, "$.f"],
    ["symbol", Symbol("s"), "$"],
    ["top-level undefined", undefined, "$"],
    ["undefined array item", [1, undefined], "$[1]"],
    ["Date", { when: new Date(0) }, "$.when"],
    ["Map", new Map(), "$"],
    ["lone surrogate", { s: "\ud800" }, "$.s"],
    ["circular reference", circular, "$.self"],
  ])("rejects %s and reports its path", (_label, value, path) => {
    let caught: unknown;
    try {
      canonicalJson(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CanonicalJsonError);
    expect((caught as CanonicalJsonError).path).toBe(path);
  });
});

describe("canonicalJson — properties", () => {
  it("round-trips: parsing the output gives back the same JSON data", () => {
    // Compared through JSON.stringify's view of the data: JSON has one zero, so -0 and 0 are the
    // same JSON value (RFC 8785 §3.2.2.3) and must not count as a difference.
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(JSON.parse(canonicalJson(value))).toStrictEqual(JSON.parse(JSON.stringify(value)));
      })
    );
  });

  it("round-trips -0 nested in arrays as 0 (regression: found by the round-trip property)", () => {
    expect(canonicalJson([[-0]])).toBe("[[0]]");
    expect(JSON.parse(canonicalJson({ a: [-0, 1] }))).toStrictEqual({ a: [0, 1] });
  });

  it("is idempotent: canonicalising canonical output changes nothing", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalJson(value);
        expect(canonicalJson(JSON.parse(once))).toBe(once);
      })
    );
  });

  it("does not depend on the order in which keys were inserted", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(record));
      })
    );
  });
});
