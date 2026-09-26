import { createHash } from "node:crypto";
import { cacheFileName, sourceUrl, type Fixture } from "./fixtures.ts";

export interface FetchDeps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }>;
  readFile: (path: string) => Promise<Uint8Array | undefined>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  log: (line: string) => void;
}

export type FetchOutcome = "cached" | "downloaded";

/**
 * Makes sure one fixture is in the cache with exactly the pinned content. A cached copy with the wrong
 * hash is replaced; a download with the wrong hash is rejected and never written.
 */
export async function ensureFixture(fixture: Fixture, cacheDir: string, deps: FetchDeps): Promise<FetchOutcome> {
  const target = `${cacheDir}/${cacheFileName(fixture)}`;
  const cached = await deps.readFile(target);
  if (cached && sha256(cached) === fixture.sha256) {
    deps.log(`${fixture.id}: cached`);
    return "cached";
  }
  const url = sourceUrl(fixture);
  deps.log(`${fixture.id}: downloading ${url}`);
  const response = await deps.fetch(url);
  if (!response.ok) throw new Error(`${fixture.id}: HTTP ${response.status} from ${url}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(data);
  if (actual !== fixture.sha256) {
    throw new Error(`${fixture.id}: SHA-256 mismatch (expected ${fixture.sha256}, got ${actual}); refusing to use it`);
  }
  await deps.writeFile(target, data);
  return "downloaded";
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
