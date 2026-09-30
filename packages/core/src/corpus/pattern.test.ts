import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { stringMatching } from "./pattern.ts";

/** Asserts the result matches the pattern (as the generator's caller checks) and returns it. */
function match(pattern: string, minLength = 0): string | undefined {
  const value = stringMatching(pattern, minLength);
  if (value !== undefined) expect(new RegExp(pattern).test(value), `${pattern} → ${value}`).toBe(true);
  return value;
}

describe("stringMatching", () => {
  it("builds ids, hashes and codes that real API patterns ask for", () => {
    expect(match("^[0-9a-f]{40}([0-9a-f]{24})?$")).toBe("a".repeat(40));
    expect(match("^run_[0-9a-z]{20,32}$")).toBe(`run_${"a".repeat(20)}`);
    expect(match("^[A-Za-z0-9._:/-]+$", 8)).toBe("aaaaaaaa");
    expect(match("^[A-Z]{3}$")).toBe("AAA");
    expect(match("^\\d{4}-\\d{2}-\\d{2}$")).toBe("0000-00-00");
    expect(match("^(?<scheme>https?)://[^/\\s]+$")).toBe("http://a");
    expect(match("^(?:v|V)\\d+(\\.\\d+){0,2}$")).toBe("v0");
    expect(match("^sk_(live|test)_[a-zA-Z0-9]{24}$")).toBe(`sk_live_${"a".repeat(24)}`);
    expect(match("^\\+?[1-9]\\d{1,14}$")).toBe("10");
  });

  it("grows quantified parts, left to right, to reach minLength", () => {
    expect(match("^a*b*$", 3)).toBe("aaa");
    expect(match("^a{0,2}b+$", 4)).toBe("aabb");
  });

  it("handles escapes, classes with sets, negation, dots and literal braces", () => {
    expect(match("^\\x41\\u0042\\.\\t$")).toBe("AB.\t");
    expect(match("^[\\w.-]+@[^\\s@]+$")).toBe("a@a");
    expect(match("^[^a-z0-9]$")).toBe("A");
    expect(match("^[\\D][\\S][\\W]$")).toBe("aa-");
    expect(match("^a.c$")).toBe("aac");
    expect(match("^x{a}$")).toBe("x{a}");
    expect(match("^\\bword\\b$")).toBe("word");
    expect(match("^[\\]\\-]$")).toBe("-");
    expect(match("^[\\b]$")).toBe("\b");
    expect(match("^a+?$")).toBe("a");
    expect(match("^\\p$")).toBe("p"); // without the u flag, \p is a literal p
  });

  it("gives up on lookarounds, back-references, empty classes and unbalanced input", () => {
    for (const pattern of [
      "^(?=a)a$",
      "^(?!b)a$",
      "(a)\\1",
      "\\k<x>",
      "[]",
      "(a",
      "[a",
      "\\",
      "[b-a]",
      "a{99999}",
      "\\cA",
      "(?<x",
    ]) {
      expect(stringMatching(pattern), pattern).toBeUndefined();
    }
  });

  it("matches whatever it returns, for patterns built from the supported subset", () => {
    const atom = fc.constantFrom("a", "[a-z]", "[^a-c]", "\\d", "\\w", "[0-9A-F]", "(x|y)", "(?:ab)", "\\.", "-", "_");
    const quantifier = fc.constantFrom("", "?", "*", "+", "{2}", "{1,3}", "{0,}");
    const pattern = fc
      .array(fc.tuple(atom, quantifier), { minLength: 1, maxLength: 6 })
      .map((parts) => `^${parts.map(([a, q]) => a + q).join("")}$`);
    fc.assert(
      fc.property(pattern, fc.nat(12), (source, minLength) => {
        const value = stringMatching(source, minLength);
        expect(value).toBeDefined();
        expect(new RegExp(source).test(value ?? "")).toBe(true);
      })
    );
  });
});
