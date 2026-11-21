import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const web = fileURLToPath(new URL("../../", import.meta.url));
// Only the guard runs, without type information: the snippets are not files of the TypeScript project.
const eslint = new ESLint({
  cwd: web,
  overrideConfig: { languageOptions: { parserOptions: { projectService: false, project: null } } },
  ruleFilter: ({ ruleId }) => ruleId === "no-restricted-syntax",
});

/** The rule ids ESLint reports for `code` as if it were the file at `path`. */
async function rules(code: string, path: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: `${web}${path}` });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

// The first lint loads the TypeScript parser and the whole config: seconds when CI runs every package at once.
describe("the no-fake-data guard (PLAN M7)", { timeout: 30_000 }, () => {
  const page = "src/app/(product)/dashboard/fake/page.tsx";

  it("refuses module-level data arrays in product pages, in every form", async () => {
    for (const code of [
      'const RUNS = [{ id: "run_1", breaking: 3 }];\nexport default function Page() { return RUNS.length; }\n',
      'export const RUNS = [{ id: "run_1" }] as const;\nexport default function Page() { return RUNS.length; }\n',
      "const DATA = { runs: [1, 2, 3] };\nexport default function Page() { return DATA.runs.length; }\n",
      'const RUNS = ["a"] satisfies string[];\nexport default function Page() { return RUNS.length; }\n',
    ]) {
      expect(await rules(code, page), code).toContain("no-restricted-syntax");
    }
  });

  it("allows arrays built while rendering, and data arrays outside product pages", async () => {
    const local =
      "export default function Page() {\n  const rows = [1, 2].map((n) => n * 2);\n  return rows.length;\n}\n";
    expect(await rules(local, page)).not.toContain("no-restricted-syntax");
    const marketing = 'const LABELS = ["BREAKING"];\nexport default function Page() { return LABELS.length; }\n';
    expect(await rules(marketing, "src/app/fake-marketing/page.tsx")).not.toContain("no-restricted-syntax");
  });
});
