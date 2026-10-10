import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Report } from "@drift/report-schema";
import AjvDraft04 from "ajv-draft-04";
import { beforeAll, describe, expect, it } from "vitest";
import { compare } from "../compare.ts";
import { readJsonl } from "../corpus/traffic.ts";
import { ingestSpec } from "../ingest/ingest.ts";
import type { SpecReader } from "../ingest/types.ts";
import { escapeHtml } from "./html.ts";
import { escapeXml } from "./junit.ts";
import { codeBlock, escapeMarkdown, MARKDOWN_MARKER, renderMarkdown } from "./markdown.ts";
import { REPORT_FORMATS, renderReport } from "./render.ts";

const dir = fileURLToPath(new URL("../../../../examples/petstore/", import.meta.url));
const reader: SpecReader = {
  size: async (path) => (await stat(path)).size,
  readText: (path) => readFile(path, "utf8"),
  realpath: (path) => realpath(path),
};
const sarifSchema = JSON.parse(
  readFileSync(new URL("./sarif-schema/sarif-schema-2.1.0.json", import.meta.url), "utf8")
) as object;

async function petstore(withTraffic: boolean): Promise<Report> {
  const spec = async (name: string) => {
    const result = await ingestSpec(`${dir}${name}`, {
      reader,
      displayPath: (p) => `examples/petstore/${p.slice(dir.length)}`,
    });
    if (!result.spec) throw new Error(name);
    return result.spec;
  };
  const text = readFileSync(`${dir}traffic.jsonl`, "utf8");
  async function* lines() {
    await Promise.resolve();
    yield* text.split("\n");
  }
  return compare({
    base: await spec("v1.yaml"),
    head: await spec("v2-breaking.yaml"),
    asOf: "2026-09-28",
    ...(withTraffic
      ? { traffic: { kind: "jsonl" as const, hash: "0".repeat(64), open: () => readJsonl(lines()) } }
      : {}),
  });
}

/** A report whose every string field is hostile, to test escaping in each format. */
function hostile(report: Report): Report {
  const evil = "<script>alert(1)</script> [x](https://evil.example) ``` </details> & \u0007 | *bold* <!-- -->";
  const [first, ...rest] = report.changes;
  if (!first) throw new Error("no changes");
  return {
    ...report,
    base: { ...report.base, file: evil },
    changes: [
      {
        ...first,
        message: evil,
        rationale: evil,
        operation: evil,
        suppression: { reason: evil, expiresAt: "2026-12-31" },
        escalation: evil,
        evidence: {
          ...first.evidence,
          examples: [
            {
              sample: "r:1",
              origin: "recorded",
              payload: { note: evil },
              redacted: [],
              errors: [{ pointer: "/body/x", keyword: "enum", message: evil }],
              bodyOmitted: { bytes: 140_000, values: { "/body/x": evil } },
            },
          ],
        },
      },
      ...rest,
    ],
    diagnostics: [{ level: "warning", code: "X", message: evil }],
    unattributed: [
      {
        operation: evil,
        direction: "request",
        count: 2,
        example: { sample: "s:1", origin: "synthetic", payload: {}, redacted: [], errors: [] },
      },
    ],
  };
}

let report: Report;
beforeAll(async () => {
  report = await petstore(true);
});

describe("renderReport", () => {
  it("renders every format", () => {
    for (const format of REPORT_FORMATS) expect(renderReport(report, format).length).toBeGreaterThan(100);
    expect(JSON.parse(renderReport(report, "json"))).toEqual(report);
  });

  it("colours the console only when asked", () => {
    expect(renderReport(report, "console")).not.toContain("\u001b[");
    const coloured = renderReport(report, "console", { color: true });
    expect(coloured).toContain("\u001b[31m");
    // Removing the colour codes gives exactly the plain report.
    expect(coloured.replace(new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g"), "")).toBe(
      renderReport(report, "console")
    );
  });
});

describe("SARIF", () => {
  const validate = new AjvDraft04.default({ allErrors: true, strict: false, logger: false }).compile(sarifSchema);

  it("validates against the official SARIF 2.1.0 schema, with and without traffic, and when hostile", async () => {
    for (const candidate of [report, await petstore(false), hostile(report)]) {
      const sarif = JSON.parse(renderReport(candidate, "sarif")) as unknown;
      expect(validate(sarif), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  // M3 acceptance: the SARIF file drift compare writes (golden, from the CLI tests) is valid SARIF 2.1.0.
  it("accepts the committed CLI golden examples/petstore/expected.sarif", () => {
    const golden = JSON.parse(readFileSync(`${dir}expected.sarif`, "utf8")) as unknown;
    expect(validate(golden), JSON.stringify(validate.errors)).toBe(true);
  });

  it("reports BREAKING as errors and RISKY as warnings at the line that changed, and leaves SAFE out", () => {
    const sarif = JSON.parse(renderReport(report, "sarif")) as {
      runs: {
        results: {
          level: string;
          ruleId: string;
          locations: { physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }[];
        }[];
      }[];
    };
    const results = sarif.runs[0]?.results ?? [];
    expect(results.filter((r) => r.level === "error")).toHaveLength(report.summary.breaking);
    expect(results.filter((r) => r.level === "warning")).toHaveLength(report.summary.risky);
    const enumRemoved = results.find((r) => r.ruleId === "DRIFT-REQ-SCHEMA-ENUM-VALUE-REMOVED" && r.level === "error");
    expect(enumRemoved?.locations[0]?.physicalLocation).toEqual({
      artifactLocation: { uri: "examples/petstore/v1.yaml", uriBaseId: "%SRCROOT%" },
      region: { startLine: 77, startColumn: 13 },
    });
  });
});

describe("HTML", () => {
  it("is self-contained: no scripts, no external URLs, a strict CSP matching its one stylesheet", () => {
    const html = renderReport(hostile(report), "html");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(?:src|href)=/i);
    expect(html).not.toMatch(/https?:\/\/(?!evil\.example)/);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const hash = createHash("sha256").update(style).digest("base64");
    expect(html).toContain(`style-src 'sha256-${hash}'`);
    expect(html).toContain("default-src 'none'");
  });

  it("escapes every value", () => {
    const html = renderReport(hostile(report), "html");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("examples with an omitted body", () => {
  it("say so, with the size and the failing values, in every format", () => {
    // Markdown shows samples of changes that count (a suppressed change is one row of the Suppressed table).
    const counted: Report = {
      ...hostile(report),
      changes: hostile(report).changes.map((change) => {
        const copy = { ...change };
        delete copy.suppression;
        return copy;
      }),
    };
    for (const format of ["console", "md", "html"] as const) {
      expect(renderReport(counted, format)).toMatch(/body omitted \(136\.7 KiB, too large for the report\)/);
    }
    expect(renderReport(hostile(report), "console")).toContain('values at the failing pointers: {"/body/x":"<script>');
  });
});

describe("Markdown", () => {
  it("starts with the marker the Action looks for, and neutralises links, HTML and fences", () => {
    const md = renderReport(hostile(report), "md");
    expect(md.startsWith(`${MARKDOWN_MARKER}\n`)).toBe(true);
    // Fenced code shows its content literally (the fences are always longer than any backtick run inside).
    const outsideCode = md.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1$/gm, "");
    expect(outsideCode).not.toContain("<script>");
    expect(outsideCode).not.toContain("[x](https://evil.example)");
    expect(outsideCode).not.toMatch(/<\/details> &/);
    expect(outsideCode).not.toContain("*bold*");
    expect(escapeMarkdown("a|b [c](d) <e> `f`")).toBe("a\\|b \\[c\\]\\(d\\) &lt;e\\> \\`f\\`");
  });

  it("fits a length limit by listing fewer changes, in order, and says how many it left out", () => {
    const full = renderMarkdown(report);
    expect(renderMarkdown(report, { maxLength: full.length })).toBe(full);
    const s = report.summary;
    expect(s.breaking).toBeGreaterThan(1);

    // Room for about one BREAKING change: the rest are counted, not listed.
    const oneBreaking = full.indexOf("\n- **", full.indexOf("### BREAKING") + 20);
    const short = renderMarkdown(report, { maxLength: oneBreaking + 900, fullReport: "See the job summary." });
    expect(short.length).toBeLessThanOrEqual(oneBreaking + 900);
    expect(short.startsWith(`${MARKDOWN_MARKER}\n`)).toBe(true);
    expect(short).toContain(`### BREAKING (${String(s.breaking)})`);
    // The hint is escaped like any other text (it is Markdown-escaped, so its full stop is too).
    expect(short).toContain(
      `Shortened to fit: ${String(s.breaking - 1)} BREAKING, ${String(s.risky)} RISKY, ${String(s.safe)} SAFE changes are not listed here. See the job summary\\.`
    );
    expect(short).not.toContain("| Operation |"); // nothing after a severity that did not fit completely
    expect(short).toContain("<sub>DRIFT ");

    // Too small for anything: the header, the note and the footer still come back.
    const minimal = renderMarkdown(report, { maxLength: 10 });
    expect(minimal).toContain(`${String(s.breaking)} BREAKING`);
    expect(minimal).not.toContain("\n- **");
  });

  it("lists suppressed changes in their own collapsed table, not under their label", () => {
    const [first, second, ...rest] = report.changes.filter((change) => change.severity === "BREAKING");
    if (!first || !second) throw new Error("needs two BREAKING changes");
    const accepted = (change: (typeof report.changes)[number]) => ({
      ...change,
      suppression: { reason: "Accepted: clients were migrated.", expiresAt: "2026-12-31" },
    });
    const withSuppressions: Report = {
      ...report,
      changes: report.changes.map((change) =>
        change.id === first.id || change.id === second.id ? accepted(change) : change
      ),
      summary: { ...report.summary, breaking: report.summary.breaking - 2, suppressed: 2 },
    };
    const md = renderMarkdown(withSuppressions);
    expect(md).toContain(`### BREAKING (${String(rest.length)})`);
    expect(md).toContain("<summary><strong>Suppressed (2)</strong></summary>");
    expect(md).toContain(
      `| <code>${escapeMarkdown(first.operation)}</code> | BREAKING | ${escapeMarkdown(first.message)} <code>${first.id}</code> | 2026\\-12\\-31 | Accepted: clients were migrated\\. |`
    );
    // A suppressed change is not repeated in full under BREAKING.
    const breakingSection = md.slice(md.indexOf("### BREAKING"), md.indexOf("<summary><strong>"));
    expect(breakingSection).not.toContain(`<code>${first.id}</code>`);

    // All of them suppressed: no BREAKING section at all, and a shortened report counts the suppressed rows too.
    const allAccepted: Report = {
      ...report,
      changes: report.changes.map((change) => (change.severity === "BREAKING" ? accepted(change) : change)),
    };
    const quiet = renderMarkdown(allAccepted);
    expect(quiet).not.toContain("### BREAKING");
    const cut = quiet.indexOf("<summary><strong>Suppressed") + 200;
    expect(renderMarkdown(allAccepted, { maxLength: cut })).toMatch(
      /Shortened to fit: [^\n]*\d+ suppressed changes? (is|are) not listed here/
    );
  });

  it("uses code fences longer than any backtick run in the content", () => {
    expect(codeBlock("x ``` y", "json")).toBe("````json\nx ``` y\n````");
    expect(codeBlock("plain")).toBe("```\nplain\n```");
  });
});

describe("JUnit", () => {
  it("has one failure per change that fails the gate, and escapes values and control characters", () => {
    const xml = renderReport(report, "junit");
    expect(xml).toContain(`tests="${String(report.changes.length)}" failures="${String(report.summary.breaking)}"`);
    const evil = renderReport(hostile(report), "junit");
    expect(evil).not.toContain("<script>");
    expect(evil).not.toContain("\u0007");
    expect(evil).toContain('<skipped message="suppressed: &lt;script&gt;');
    expect(escapeXml(`<"'&>`)).toBe("&lt;&quot;&apos;&amp;&gt;");
  });
});
