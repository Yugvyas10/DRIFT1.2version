import { posix } from "node:path";
import type { SpecReader } from "../ingest/types.ts";

/**
 * An in-memory SpecReader for tests: files by absolute path, plus optional symlinks
 * (link path → target path), which `realpath` resolves component by component like a real file system.
 */
export function memoryReader(
  files: Record<string, string>,
  symlinks: Record<string, string> = {}
): SpecReader & {
  reads: string[];
} {
  const reads: string[] = [];
  const directories = new Set<string>();
  for (const path of Object.keys(files)) {
    for (let dir = posix.dirname(path); dir !== "/"; dir = posix.dirname(dir)) directories.add(dir);
  }
  directories.add("/");

  const resolveLinks = (path: string): string => {
    let resolved = "/";
    for (const part of path.split("/").filter(Boolean)) {
      let next = posix.join(resolved, part);
      for (let hops = 0, target = symlinks[next]; target !== undefined && hops < 16; hops++, target = symlinks[next]) {
        next = posix.resolve(posix.dirname(next), target);
      }
      resolved = next;
    }
    return resolved;
  };

  const lookup = (path: string): string => {
    const content = files[resolveLinks(path)];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };

  return {
    reads,
    size: (path) => Promise.resolve(Buffer.byteLength(lookup(path))),
    readText: (path) => {
      reads.push(path);
      return Promise.resolve(lookup(path));
    },
    realpath: (path) => {
      const resolved = resolveLinks(path);
      if (files[resolved] === undefined && !directories.has(resolved))
        return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(resolved);
    },
  };
}
