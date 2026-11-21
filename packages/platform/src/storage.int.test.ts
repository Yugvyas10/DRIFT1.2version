import { createHash } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { artifactKey, createS3Store, stageCacheKey } from "./storage.ts";

const store = createS3Store(inject("s3"));
const unique = () => `${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;

describe("object store", () => {
  it("writes and reads text, within a size limit", async () => {
    const key = stageCacheKey("org_a", unique());
    expect(await store.getText(key, 1000)).toBeUndefined();
    await store.putText(key, '{"changes":[]}', "application/json");
    expect(await store.getText(key, 1000)).toBe('{"changes":[]}');
    expect(await store.getText(key, 5)).toBeUndefined(); // larger than the caller accepts
  });

  it("streams an object and inspects its size and hash", async () => {
    const text = "line one\nline two\n".repeat(2000);
    const key = artifactKey("org_a", createHash("sha256").update(text).digest("hex"));
    await store.putText(key, text, "application/x-ndjson");
    const chunks: Uint8Array[] = [];
    for await (const chunk of (await store.stream(key)) ?? []) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString("utf8")).toBe(text);
    expect(await store.inspect(key, 10_000_000)).toEqual({
      size: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
    });
    expect((await store.inspect(key, 100))?.sha256).toBe(""); // over the limit: not hashed to the end
    expect(await store.stream(artifactKey("org_a", "0".repeat(64)))).toBeUndefined();
    expect(await store.inspect(artifactKey("org_a", "0".repeat(64)), 100)).toBeUndefined();
  });

  it("signs upload and download URLs under the organisation's prefix, and answers a ping", async () => {
    const key = artifactKey("org_b", unique());
    const put = await store.presignPut(key, "text/plain");
    expect(new URL(put.url).pathname).toContain("/orgs/org_b/sha256/");
    expect(
      (await fetch(put.url, { method: "PUT", headers: { "content-type": "text/plain" }, body: "hello" })).status
    ).toBe(200);
    const get = await store.presignGet(key);
    expect(await (await fetch(get.url)).text()).toBe("hello");
    expect(get.expiresAt.getTime()).toBeLessThan(put.expiresAt.getTime());
    await expect(store.ping()).resolves.toBeUndefined();
    const elsewhere = createS3Store({ ...inject("s3"), bucket: "no-such-bucket" });
    await expect(elsewhere.ping()).rejects.toThrow("the bucket answered HTTP 404");
    const wrongKey = createS3Store({ ...inject("s3"), secretAccessKey: "not-the-secret" });
    await expect(wrongKey.ping()).rejects.toThrow("the bucket answered HTTP 403");
  });
});
