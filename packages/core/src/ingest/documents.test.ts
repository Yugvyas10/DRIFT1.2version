import { describe, expect, it } from "vitest";
import { memoryReader } from "../testing/memory-reader.ts";
import { collectRefs, isInside, loadDocumentSet } from "./documents.ts";
import { DEFAULT_LIMITS } from "./types.ts";

const root = (schemaRef: string) =>
  `openapi: 3.0.3\ninfo: {title: t, version: "1"}\npaths:\n  /a:\n    get:\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema:\n                $ref: "${schemaRef}"\n`;

describe("loadDocumentSet", () => {
  it("loads local files referenced directly and indirectly, relative to each file", async () => {
    const reader = memoryReader({
      "/api/openapi.yaml": root("./schemas/order.yaml#/Order"),
      "/api/schemas/order.yaml": "Order:\n  properties:\n    line:\n      $ref: ./line.yaml\n",
      "/api/schemas/line.yaml": "type: object\n",
    });
    const { set, diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(diagnostics).toEqual([]);
    expect([...(set?.documents.keys() ?? [])]).toEqual([
      "/api/openapi.yaml",
      "/api/schemas/order.yaml",
      "/api/schemas/line.yaml",
    ]);
    expect(set?.documents.get("/api/schemas/line.yaml")?.relative).toBe("schemas/line.yaml");
  });

  it("never fetches remote references (SSRF)", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("https://attacker.example/pet.json") });
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(diagnostics).toMatchObject([
      { code: "REF_REMOTE_DISALLOWED", line: 12, pointer: expect.stringContaining("$ref") as unknown },
    ]);
    expect(reader.reads).toEqual(["/api/openapi.yaml"]);
  });

  it("refuses other URI schemes", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("file:///etc/passwd") });
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(diagnostics).toMatchObject([{ code: "REF_UNSUPPORTED" }]);
  });

  it("refuses ../ escapes from the ref root and never reads the target", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("../secrets/key.yaml"), "/secrets/key.yaml": "k: v\n" });
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(diagnostics).toMatchObject([{ code: "REF_OUTSIDE_ROOT" }]);
    expect(reader.reads).not.toContain("/secrets/key.yaml");
  });

  it("refuses symlinks that point outside the ref root", async () => {
    const reader = memoryReader(
      { "/api/openapi.yaml": root("./link.yaml"), "/secrets/key.yaml": "k: v\n" },
      { "/api/link.yaml": "/secrets/key.yaml" }
    );
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(diagnostics).toMatchObject([{ code: "REF_OUTSIDE_ROOT" }]);
    expect(reader.reads).not.toContain("/secrets/key.yaml");
  });

  it("allows a wider ref root when the caller asks for one", async () => {
    const reader = memoryReader({
      "/repo/api/openapi.yaml": root("../shared/pet.yaml"),
      "/repo/shared/pet.yaml": "type: object\n",
    });
    const { diagnostics } = await loadDocumentSet("/repo/api/openapi.yaml", { reader, refRoot: "/repo" });
    expect(diagnostics).toEqual([]);
  });

  it("rejects a spec that is itself outside the ref root", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("#/x"), "/other/x": "" });
    const { set, diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader, refRoot: "/other" });
    expect(set).toBeUndefined();
    expect(diagnostics).toMatchObject([{ code: "REF_OUTSIDE_ROOT" }]);
  });

  it("reports missing files and a missing ref root", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("./missing.yaml") });
    expect((await loadDocumentSet("/api/openapi.yaml", { reader })).diagnostics).toMatchObject([
      { code: "REF_NOT_FOUND" },
    ]);
    expect((await loadDocumentSet("/api/nope.yaml", { reader })).diagnostics).toMatchObject([
      { code: "FILE_READ_ERROR" },
    ]);
    expect((await loadDocumentSet("/api/openapi.yaml", { reader, refRoot: "/nowhere" })).diagnostics).toMatchObject([
      { code: "FILE_READ_ERROR" },
    ]);
  });

  it("checks the size before reading, per file and in total", async () => {
    const big = memoryReader({ "/api/openapi.yaml": root("./big.yaml"), "/api/big.yaml": `a: "${"x".repeat(400)}"\n` });
    const perFile = await loadDocumentSet("/api/openapi.yaml", { reader: big, limits: { maxFileBytes: 300 } });
    expect(perFile.diagnostics).toMatchObject([{ code: "FILE_TOO_LARGE", file: "/api/big.yaml" }]);
    expect(big.reads).not.toContain("/api/big.yaml");
    const total = await loadDocumentSet("/api/openapi.yaml", { reader: big, limits: { maxTotalBytes: 500 } });
    expect(total.diagnostics).toMatchObject([{ code: "FILE_TOO_LARGE" }]);
    const rootTooBig = await loadDocumentSet("/api/openapi.yaml", { reader: big, limits: { maxFileBytes: 10 } });
    expect(rootTooBig.set).toBeUndefined();
  });

  it("limits how many files a spec can pull in", async () => {
    const files: Record<string, string> = { "/api/openapi.yaml": root("./f0.yaml") };
    for (let i = 0; i < 10; i++) files[`/api/f${i}.yaml`] = `next:\n  $ref: ./f${i + 1}.yaml\n`;
    files["/api/f10.yaml"] = "end: true\n";
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", {
      reader: memoryReader(files),
      limits: { maxFiles: 4 },
    });
    expect(diagnostics).toMatchObject([{ code: "TOO_MANY_FILES" }]);
  });

  it("reports parse errors in referenced files without stopping", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("./bad.yaml"), "/api/bad.yaml": "a: [\n" });
    const { set, diagnostics } = await loadDocumentSet("/api/openapi.yaml", { reader });
    expect(set).toBeDefined();
    expect(diagnostics[0]).toMatchObject({ code: "SYNTAX_ERROR", file: "/api/bad.yaml" });
  });

  it("uses the caller's display paths", async () => {
    const reader = memoryReader({ "/api/openapi.yaml": root("https://x.example/a") });
    const { diagnostics } = await loadDocumentSet("/api/openapi.yaml", {
      reader,
      displayPath: (p) => p.replace("/api/", ""),
    });
    expect(diagnostics[0]?.file).toBe("openapi.yaml");
  });

  it("applies default limits", () => {
    expect(DEFAULT_LIMITS.maxAliasCount).toBeGreaterThan(0);
  });
});

describe("collectRefs", () => {
  it("finds $refs but skips examples, defaults, enums and x- extensions", () => {
    const refs = collectRefs({
      a: { $ref: "./a.yaml" },
      example: { $ref: "./example-data.yaml" },
      default: { $ref: "https://x.example" },
      "x-internal": { $ref: "./ignored.yaml" },
      properties: { example: { $ref: "./property-named-example.yaml" } },
      list: [{ $ref: "#/b" }],
    });
    expect(refs.map((ref) => ref.value).sort()).toEqual(["#/b", "./a.yaml", "./property-named-example.yaml"]);
    expect(refs.find((ref) => ref.value === "#/b")?.tokens).toEqual(["list", "0", "$ref"]);
  });
});

describe("isInside", () => {
  it.each([
    ["/a/b", "/a", true],
    ["/a", "/a", true],
    ["/ab", "/a", false],
    ["/b", "/a", false],
  ])("%s inside %s → %s", (path, rootDir, expected) => {
    expect(isInside(path, rootDir)).toBe(expected);
  });
});
