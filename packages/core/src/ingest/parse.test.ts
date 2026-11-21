import { describe, expect, it } from "vitest";
import { parseSpecText } from "./parse.ts";
import { DEFAULT_LIMITS } from "./types.ts";

const parse = (text: string, limits = DEFAULT_LIMITS) => parseSpecText(text, "spec.yaml", limits);

describe("parseSpecText", () => {
  it("parses JSON and YAML to the same value", () => {
    const json = parse('{"openapi":"3.0.3","info":{"title":"t"}}');
    const yaml = parse("openapi: 3.0.3\ninfo:\n  title: t\n");
    expect(json).toEqual(yaml);
    expect(json).toEqual({ ok: true, value: { openapi: "3.0.3", info: { title: "t" } } });
  });

  it("reports YAML syntax errors with line and column", () => {
    const result = parse("info:\n  title: a\n    version: 1\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({ code: "SYNTAX_ERROR", file: "spec.yaml", line: 2, column: 10 });
  });

  it("reports invalid JSON through the YAML parser, with a position", () => {
    const result = parse('{\n  "a": 1,\n  "b": [1, 2\n}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.line).toBeGreaterThan(0);
  });

  it("rejects duplicate keys in YAML", () => {
    const result = parse("a: 1\na: 2\n");
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "DUPLICATE_KEY", line: 2, column: 1 }] });
  });

  it("stops YAML alias bombs", () => {
    const lines = ['a0: &a0 ["x","x","x","x","x","x","x","x","x","x"]'];
    for (let level = 1; level < 8; level++)
      lines.push(
        `a${level}: &a${level} [${Array(10)
          .fill(`*a${level - 1}`)
          .join(",")}]`
      );
    const result = parse(lines.join("\n"));
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "ALIAS_LIMIT" }] });
  });

  it("allows a few aliases", () => {
    expect(parse("a: &x {k: 1}\nb: *x\n")).toEqual({ ok: true, value: { a: { k: 1 }, b: { k: 1 } } });
  });

  it("rejects nesting deeper than the limit, in JSON and in YAML", () => {
    const limits = { ...DEFAULT_LIMITS, maxDepth: 5 };
    const json = parse(`${"[".repeat(7)}${"]".repeat(7)}`, limits);
    expect(json).toMatchObject({ ok: false, diagnostics: [{ code: "DEPTH_LIMIT", pointer: "/0/0/0/0/0/0" }] });
    const yaml = parse("a:\n b:\n  c:\n   d:\n    e:\n     f:\n      g: 1\n", limits);
    expect(yaml).toMatchObject({ ok: false, diagnostics: [{ code: "DEPTH_LIMIT" }] });
    expect(parse("a:\n b:\n  c: 1\n", limits).ok).toBe(true);
  });

  it("survives input nested far beyond any sane limit without throwing", () => {
    const deep = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
    const result = parse(deep);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "DEPTH_LIMIT" }] });
  });
});
