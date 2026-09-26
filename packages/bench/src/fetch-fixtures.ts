import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureFixture } from "./fetch.ts";
import { FIXTURES } from "./fixtures.ts";

/** `pnpm --filter @drift/bench run fixtures:fetch` — downloads and verifies every pinned fixture. */
const cacheDir = fileURLToPath(new URL("../fixtures/.cache", import.meta.url));
await mkdir(cacheDir, { recursive: true });
for (const fixture of FIXTURES) {
  await ensureFixture(fixture, cacheDir, {
    fetch: (url) => fetch(url),
    readFile: (path) => readFile(path).catch(() => undefined),
    writeFile: (path, data) => writeFile(path, data),
    log: (line) => {
      console.log(line);
    },
  });
}
