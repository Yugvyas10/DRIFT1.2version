import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { SpecReader } from "@drift/core";

/** Reads specs from the local file system: the adapter the engine needs to stay free of I/O (PLAN §3.2). */
export function createFsReader(): SpecReader {
  return {
    size: async (path) => (await stat(path)).size,
    readText: (path) => readFile(path, "utf8"),
    realpath: (path) => realpath(path),
  };
}

/** Paths in diagnostics are shown relative to the working directory when they are inside it. */
export function displayPath(cwd: string): (absolutePath: string) => string {
  return (absolutePath) => {
    const shown = relative(cwd, absolutePath);
    return shown === "" || shown.startsWith("..") ? absolutePath : shown;
  };
}

export function absolute(cwd: string, path: string): string {
  return resolve(cwd, path);
}
