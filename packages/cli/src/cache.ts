import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StageCache } from "@drift/core";

/**
 * The local stage cache (ADR-0006): one file per stage output under `<dir>/<first two hex digits>/<hash>.json`.
 * Keys are content hashes of the stage inputs, so an entry never goes stale; delete the directory to reclaim space.
 * Writes go to a temporary file first and are renamed into place, so a crash never leaves a half-written entry.
 */
export function createFsCache(dir: string): StageCache {
  const path = (hash: string) => join(dir, hash.slice(0, 2), `${hash}.json`);
  return {
    async get(hash) {
      try {
        return await readFile(path(hash), "utf8");
      } catch {
        return undefined;
      }
    },
    async put(hash, value) {
      const target = path(hash);
      await mkdir(join(dir, hash.slice(0, 2)), { recursive: true });
      const temporary = `${target}.${String(process.pid)}.tmp`;
      await writeFile(temporary, value);
      await rename(temporary, target);
    },
  };
}
