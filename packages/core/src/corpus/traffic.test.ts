import { describe, expect, it } from "vitest";
import { MAX_LINE_LENGTH, readHar, readJsonl, toSample, type TrafficEntry } from "./traffic.ts";

async function collect(lines: string[]): Promise<TrafficEntry[]> {
  async function* source() {
    await Promise.resolve();
    yield* lines;
  }
  const out: TrafficEntry[] = [];
  for await (const entry of readJsonl(source())) out.push(entry);
  return out;
}

describe("readJsonl", () => {
  it("reads records, skips blank lines and numbers lines from 1", async () => {
    const entries = await collect(['{"method":"GET","path":"/a"}', "", '{"method":"post","path":"/b"}']);
    expect(entries).toEqual([
      { line: 1, record: { method: "GET", path: "/a" } },
      { line: 3, record: { method: "post", path: "/b" } },
    ]);
  });

  it("reports malformed lines without quoting them", async () => {
    const secret = ["sk", "live", "0123456789abcdefghij"].join("_");
    const entries = await collect([
      `not json ${secret}`,
      `{"method":"GET","path":"/a","extra":"${secret}"}`,
      '{"method":"GET"}',
      `{"method":"GET","path":"/a","status":"${secret}","clientId":""}`,
      "[1]",
    ]);
    expect(entries).toEqual([
      { line: 1, malformed: "not valid JSON" },
      { line: 2, malformed: "record: unknown field" },
      { line: 3, malformed: expect.stringMatching(/^path: /) as unknown },
      { line: 4, malformed: expect.stringMatching(/^status: .*\(and 1 more\)$/) as unknown },
      { line: 5, malformed: expect.stringMatching(/^record: /) as unknown },
    ]);
    expect(JSON.stringify(entries)).not.toContain(secret);
  });

  it("refuses lines longer than the limit without parsing them", async () => {
    const [entry] = await collect([`"${"x".repeat(MAX_LINE_LENGTH)}"`]);
    expect(entry).toEqual({ line: 1, malformed: `longer than ${String(MAX_LINE_LENGTH)} characters` });
  });
});

describe("readHar", () => {
  const har = (entries: unknown[]) => ({ log: { version: "1.2", entries } });

  it("converts entries with JSON and text bodies, headers and responses", () => {
    const entries = readHar(
      har([
        {
          startedDateTime: "2026-09-20T10:00:00.000Z",
          request: {
            method: "POST",
            url: "https://api.example.com/v1/pets?x=1",
            headers: [
              { name: ":authority", value: "api.example.com" },
              { name: "Content-Type", value: "application/json" },
              { name: "X-Tag", value: "a" },
              { name: "X-Tag", value: "b" },
              { name: 42, value: "ignored" },
              "junk",
            ],
            postData: { mimeType: "application/json; charset=utf-8", text: '{"name":"Rex"}' },
          },
          response: {
            status: 201,
            headers: [{ name: "Content-Type", value: "text/plain" }],
            content: { mimeType: "text/plain", text: "created" },
          },
        },
        {
          request: { method: "GET", url: "https://api.example.com/logo.png", headers: "none" },
          response: { status: 200, content: { mimeType: "image/png", text: "AAAA", encoding: "base64" } },
        },
        {
          request: {
            method: "POST",
            url: "https://a.example/x",
            postData: { mimeType: "application/json", text: "{bad" },
          },
        },
        { request: { method: "GET", url: "https://a.example/x" }, response: { status: 0 } },
      ])
    );
    expect(entries).toEqual([
      {
        line: 1,
        record: {
          method: "POST",
          path: "/v1/pets?x=1",
          headers: { "content-type": "application/json", "x-tag": ["a", "b"] },
          requestBody: { name: "Rex" },
          status: 201,
          responseHeaders: { "content-type": "text/plain" },
          responseBody: "created",
          timestamp: "2026-09-20T10:00:00.000Z",
        },
      },
      { line: 2, record: { method: "GET", path: "/logo.png", status: 200 } },
      { line: 3, record: { method: "POST", path: "/x", requestBody: "{bad" } },
      { line: 4, record: { method: "GET", path: "/x" } },
    ]);
  });

  it("reports what is not a HAR document or not a request", () => {
    expect(readHar({ nope: true })).toEqual([{ line: 1, malformed: "not a HAR document (no log.entries)" }]);
    expect(readHar(null)).toEqual([{ line: 1, malformed: "not a HAR document (no log.entries)" }]);
    expect(readHar(har([{}, { request: { method: "GET", url: "not a url" } }, 7]))).toEqual([
      { line: 1, malformed: "HAR entry without a request method and URL" },
      { line: 2, malformed: "HAR entry without a request method and URL" },
      { line: 3, malformed: "HAR entry without a request method and URL" },
    ]);
  });
});

describe("toSample", () => {
  it("splits the query string, lower-cases headers and infers body media types", () => {
    const sample = toSample(4, {
      method: "patch",
      path: "/pets?tag=a&tag=b&q=x%20y",
      query: { tag: "c" },
      headers: { "X-Id": ["1", "2"] },
      requestBody: { a: 1 },
      status: 200,
      responseBody: "ok",
    });
    expect(sample).toEqual({
      id: "r:4",
      origin: "recorded",
      line: 4,
      method: "PATCH",
      path: "/pets",
      query: { tag: ["c", "a", "b"], q: ["x y"] },
      headers: { "x-id": ["1", "2"] },
      body: { contentType: "application/json", value: { a: 1 } },
      response: { status: 200, headers: {}, body: { contentType: "text/plain", value: "ok" } },
      redacted: [],
    });
  });

  it("uses the declared Content-Type and leaves out absent bodies", () => {
    const sample = toSample(1, {
      method: "POST",
      path: "/x",
      headers: { "content-type": "Application/XML; charset=utf-8" },
      requestBody: "<a/>",
      status: 204,
    });
    expect(sample.body).toEqual({ contentType: "application/xml", value: "<a/>" });
    expect(sample.response).toEqual({ status: 204, headers: {} });
  });
});
