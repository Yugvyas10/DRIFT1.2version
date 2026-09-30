import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions } from "esbuild";

/**
 * `pnpm --filter @drift/github-action run build`: bundles the Action into dist/index.js, one file with every
 * dependency, because a JavaScript Action runs without an install step. The bundle is committed (action.yml
 * points at it). `--check` (CI) rebuilds in memory and fails when the committed bundle differs from the source.
 */
const root = fileURLToPath(new URL("../", import.meta.url));
const outfile = `${root}dist/index.js`;
const options: BuildOptions = {
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile,
  // Some dependencies are CommonJS and call require() for Node built-ins, which an ES module lacks.
  banner: {
    js: 'import { createRequire as __driftCreateRequire } from "node:module";\nconst require = __driftCreateRequire(import.meta.url);',
  },
  legalComments: "eof",
  logLevel: "warning",
};

if (process.argv.includes("--check")) {
  const result = await build({ ...options, write: false });
  const built = result.outputFiles[0]?.text ?? "";
  const committed = await readFile(outfile, "utf8").catch(() => "");
  if (built !== committed) {
    console.error(
      "packages/github-action/dist/index.js is out of date: run `pnpm --filter @drift/github-action run build` and commit it."
    );
    process.exit(1);
  }
  console.log("packages/github-action/dist/index.js matches the source");
} else {
  await build(options);
  console.log("wrote packages/github-action/dist/index.js");
}
