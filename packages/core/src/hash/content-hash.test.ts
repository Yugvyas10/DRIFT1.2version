import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contentHash, sha256Hex } from "./content-hash.ts";

describe("sha256Hex", () => {
  it("matches the FIPS 180-2 test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes strings as UTF-8, identically to the equivalent bytes", () => {
    expect(sha256Hex("€")).toBe(sha256Hex(new TextEncoder().encode("€")));
  });
});

describe("contentHash", () => {
  it("is a 64-character lowercase hex digest", () => {
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the SHA-256 of the canonical form", () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(sha256Hex('{"a":1,"b":2}'));
  });

  it("gives equal hashes for equal data built in a different key order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(contentHash(reversed)).toBe(contentHash(record));
      })
    );
  });

  it("gives different hashes for different data", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
    expect(contentHash("1")).not.toBe(contentHash(1));
  });
});
