import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkFixture } from "./check.ts";
import { ensureFixture, sha256, type FetchDeps } from "./fetch.ts";
import { cacheFileName, FIXTURES, sourceUrl, type Fixture } from "./fixtures.ts";

const content = new TextEncoder().encode("openapi: 3.0.3\n");
const [first] = FIXTURES;
if (!first) throw new Error("the fixture manifest is empty");
const fixture: Fixture = { ...first, sha256: sha256(content) };

function fakeDeps(options: { cached?: Uint8Array; served?: Uint8Array; status?: number } = {}) {
  const written = new Map<string, Uint8Array>();
  const fetched: string[] = [];
  const logs: string[] = [];
  const deps: FetchDeps = {
    fetch: (url) => {
      fetched.push(url);
      const body = options.served ?? content;
      return Promise.resolve({
        ok: (options.status ?? 200) === 200,
        status: options.status ?? 200,
        arrayBuffer: () => Promise.resolve(body.slice().buffer),
      });
    },
    readFile: () => Promise.resolve(options.cached),
    writeFile: (path, data) => {
      written.set(path, data);
      return Promise.resolve();
    },
    log: (line) => logs.push(line),
  };
  return { deps, written, fetched, logs };
}

describe("fixture manifest", () => {
  it("pins every fixture to a full commit SHA and a SHA-256", () => {
    for (const f of FIXTURES) {
      expect(f.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.licence).toBe("MIT");
      expect(sourceUrl(f)).toBe(`https://raw.githubusercontent.com/${f.repository}/${f.commit}/${f.path}`);
    }
    expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(FIXTURES.length);
    expect(cacheFileName(fixture)).toBe("github-3.0.yaml");
  });
});

describe("ensureFixture", () => {
  it("downloads, verifies and writes a missing fixture", async () => {
    const t = fakeDeps();
    expect(await ensureFixture(fixture, "/cache", t.deps)).toBe("downloaded");
    expect(t.fetched).toEqual([sourceUrl(fixture)]);
    expect([...t.written.keys()]).toEqual(["/cache/github-3.0.yaml"]);
  });

  it("keeps a verified cached copy without downloading", async () => {
    const t = fakeDeps({ cached: content });
    expect(await ensureFixture(fixture, "/cache", t.deps)).toBe("cached");
    expect(t.fetched).toEqual([]);
  });

  it("replaces a cached copy whose hash does not match", async () => {
    const t = fakeDeps({ cached: new TextEncoder().encode("tampered") });
    expect(await ensureFixture(fixture, "/cache", t.deps)).toBe("downloaded");
  });

  it("refuses a download with the wrong content and writes nothing", async () => {
    const t = fakeDeps({ served: new TextEncoder().encode("not the pinned file") });
    await expect(ensureFixture(fixture, "/cache", t.deps)).rejects.toThrow("SHA-256 mismatch");
    expect(t.written.size).toBe(0);
  });

  it("reports HTTP errors", async () => {
    const t = fakeDeps({ status: 404 });
    await expect(ensureFixture(fixture, "/cache", t.deps)).rejects.toThrow("HTTP 404");
  });
});

describe("checkFixture", () => {
  const reader = {
    size: async (path: string) => (await stat(path)).size,
    readText: (path: string) => readFile(path, "utf8"),
    realpath: (path: string) => realpath(path),
  };
  const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));

  it("passes a valid spec whose self-diff is empty, and records its shape", async () => {
    let tick = 0;
    const check = await checkFixture("petstore", `${examples}valid/petstore-3.0.yaml`, reader, () => (tick += 5));
    expect(check).toMatchObject({
      id: "petstore",
      ok: true,
      problems: [],
      oasVersion: "3.0.3",
      operations: 3,
      selfDiffChanges: 0,
      ingestMs: 5,
      diffMs: 5,
    });
    expect(check.specHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails an invalid spec with its errors", async () => {
    const check = await checkFixture("bad", `${examples}invalid/missing-info.yaml`, reader);
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual(['OAS_SCHEMA Missing required property "info"']);
  });
});
