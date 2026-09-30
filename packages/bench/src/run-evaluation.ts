import { readFile } from "node:fs/promises";
import { expectedPage, writePage } from "./evaluation-files.ts";
import { PATHS } from "./paths.ts";

/**
 * `run evaluation` rewrites docs/EVALUATION.md from docs/evaluation/*.json.
 * `run evaluation:check` (CI) fails when the committed page differs from what the committed results give.
 */
if (process.argv.includes("--check")) {
  const committed = await readFile(PATHS.page, "utf8").catch(() => "");
  if (committed !== (await expectedPage())) {
    console.error("docs/EVALUATION.md is out of date: run `pnpm --filter @drift/bench run evaluation` and commit it.");
    process.exitCode = 1;
  } else {
    console.log("docs/EVALUATION.md matches docs/evaluation/*.json");
  }
} else {
  await writePage();
  console.log("wrote docs/EVALUATION.md");
}
