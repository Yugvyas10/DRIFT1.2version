import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { SpecReader } from "@drift/core";

const run = promisify(execFile);
const MAX_BYTES = 256 * 1024 * 1024;

export class GitError extends Error {}

/**
 * A spec argument of the form `<ref>:<path>` (`origin/main:openapi.yaml`), read from git instead of the working
 * tree. Undefined when the argument is an existing file or has no ref part.
 */
export function parseGitSpec(argument: string, cwd: string): { ref: string; path: string } | undefined {
  if (existsSync(resolve(cwd, argument))) return undefined;
  const match = /^([^:]+):(.+)$/.exec(argument);
  if (!match) return undefined;
  const [, ref = "", path = ""] = match;
  if (/^[A-Za-z]$/.test(ref)) return undefined; // a Windows drive letter, not a ref
  if (ref.startsWith("-")) throw new GitError(`"${ref}" is not a git revision`);
  return { ref, path };
}

async function git(cwd: string, args: string[]): Promise<string> {
  // execFile with an argument array: no shell, so nothing in a ref or path is interpreted.
  const { stdout } = await run("git", args, { cwd, maxBuffer: MAX_BYTES, encoding: "utf8" });
  return stdout;
}

/**
 * Reads a spec and the local files it references from one git revision, with `git cat-file` (no dependency).
 * Paths are resolved inside the repository; display paths look like `origin/main:api/openapi.yaml`.
 */
export async function createGitSource(
  cwd: string,
  spec: { ref: string; path: string }
): Promise<{ entry: string; reader: SpecReader; display: (path: string) => string }> {
  let root: string;
  let prefix: string;
  try {
    root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    // The working directory relative to the root, as git sees it (immune to symlinked temp directories).
    prefix = (await git(cwd, ["rev-parse", "--show-prefix"])).trim();
    await git(cwd, ["rev-parse", "--verify", "--quiet", `${spec.ref}^{commit}`]);
  } catch {
    throw new GitError(`"${spec.ref}" is not a revision of a git repository at ${cwd}`);
  }
  const inRepo = (path: string) => relative(root, path).split(sep).join(posix.sep);
  const object = (path: string) => `${spec.ref}:${inRepo(path)}`;
  const reader: SpecReader = {
    size: async (path) => Number((await git(root, ["cat-file", "-s", object(path)])).trim()),
    readText: (path) => git(root, ["cat-file", "blob", object(path)]),
    realpath: (path) => {
      const inside = inRepo(path);
      return inside.startsWith("..") || isAbsolute(inside)
        ? Promise.reject(new GitError(`${path} is outside the repository`))
        : Promise.resolve(resolve(path));
    },
  };
  return { entry: resolve(root, prefix, spec.path), reader, display: (path) => object(path) };
}
