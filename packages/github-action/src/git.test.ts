import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSha, systemGit } from "./git.ts";

describe("systemGit", () => {
  it("tells whether a commit or a file at a commit exists, and fails to fetch without a remote", async () => {
    const repo = mkdtempSync(join(tmpdir(), "drift-action-git-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q");
    writeFileSync(join(repo, "a.yaml"), "a: 1\n");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "one");
    const sha = git("rev-parse", "HEAD");
    expect(await systemGit.has(repo, `${sha}^{commit}`)).toBe(true);
    expect(await systemGit.has(repo, `${sha}:./a.yaml`)).toBe(true);
    expect(await systemGit.has(repo, `${sha}:./missing.yaml`)).toBe(false);
    await expect(systemGit.fetch(repo, sha)).rejects.toThrow();
  });

  it("accepts only commit ids as base commits", () => {
    expect(isSha("0123abc")).toBe(true);
    expect(isSha("a".repeat(40))).toBe(true);
    expect(isSha("--upload-pack=x")).toBe(false);
    expect(isSha("main")).toBe(false);
  });
});
