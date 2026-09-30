import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The git operations the Action needs. An interface, so tests can run without a repository. */
export interface Git {
  /** Whether `object` (a commit, or `<commit>:./<path>`) exists in the repository at `cwd`. */
  has(cwd: string, object: string): Promise<boolean>;
  /** Fetches one commit from `origin` (a shallow checkout usually lacks the base commit). */
  fetch(cwd: string, sha: string): Promise<void>;
}

/** Git through `execFile` with argument arrays: no shell, so nothing in a ref or path is interpreted. */
export const systemGit: Git = {
  async has(cwd, object) {
    try {
      await run("git", ["cat-file", "-e", object], { cwd });
      return true;
    } catch {
      return false;
    }
  },
  async fetch(cwd, sha) {
    await run("git", ["fetch", "--no-tags", "--depth=1", "origin", sha], { cwd });
  },
};

/** A full or abbreviated commit id; anything else is refused before it reaches git. */
export function isSha(value: string): boolean {
  return /^[0-9a-f]{7,64}$/.test(value);
}
