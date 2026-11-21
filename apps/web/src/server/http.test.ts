import { describe, expect, it } from "vitest";
import { z } from "zod";
import { badRequest, HttpError, json, parse, problem, readJson, route } from "./http";

const post = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://drift.test/x", { method: "POST", headers, body });

describe("problem and json", () => {
  it("answers errors as RFC 9457 problem documents that are never cached", async () => {
    const response = problem(badRequest("name: Required"));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Bad request",
      status: 400,
      detail: "name: Required",
    });
    expect(await problem(new HttpError(404, "Not found")).json()).toEqual({
      type: "about:blank",
      title: "Not found",
      status: 404,
    });
    expect(json({ ok: true }, 201).status).toBe(201);
  });
});

describe("route", () => {
  it("turns an HttpError into its problem, and anything else into a 500 that reveals nothing", async () => {
    const reported: unknown[] = [];
    const failing = route(
      (request: Request) =>
        request.url.endsWith("/known")
          ? Promise.reject(badRequest("no"))
          : Promise.reject(new Error("password=hunter2 leaked")),
      (error) => reported.push(error)
    );
    expect((await failing(new Request("http://drift.test/known"))).status).toBe(400);
    const response = await failing(new Request("http://drift.test/unknown"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
    expect(reported).toHaveLength(1);
  });

  it("logs only the error's name by default", async () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...parts: unknown[]) => lines.push(parts.join(" "));
    try {
      await route(() => Promise.reject(new TypeError("secret detail")))(new Request("http://drift.test/"));
    } finally {
      console.error = original;
    }
    expect(lines).toEqual(["unhandled error in an API route: TypeError"]);
  });
});

describe("readJson", () => {
  it("reads JSON up to the limit", async () => {
    expect(await readJson(post('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it("refuses other media types, invalid JSON and an empty body", async () => {
    await expect(
      readJson(post("a=1", { "content-type": "application/x-www-form-urlencoded" }), 100)
    ).rejects.toMatchObject({ status: 415 });
    await expect(readJson(post("{"), 100)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post(null), 100)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a body over the limit, by its declared length or, without one, while reading", async () => {
    const big = JSON.stringify({ text: "x".repeat(500) });
    await expect(
      readJson(post(big, { "content-type": "application/json", "content-length": String(big.length) }), 100)
    ).rejects.toMatchObject({
      status: 413,
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("x".repeat(50)));
        controller.close();
      },
    });
    const chunked = new Request("http://drift.test/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJson(chunked, 100)).rejects.toMatchObject({ status: 413 });
  });
});

describe("parse", () => {
  const Schema = z.strictObject({ name: z.string().min(2), secret: z.string().optional() });

  it("returns valid input and names the fields of invalid input, never their values", () => {
    expect(parse(Schema, { name: "ok" })).toEqual({ name: "ok" });
    let caught: unknown;
    try {
      parse(Schema, { name: "x", secret: 12345 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ status: 400 });
    expect((caught as HttpError).detail).toContain("name:");
    expect((caught as HttpError).detail).not.toContain("12345");
    expect(() => parse(Schema, "nope", 422)).toThrow(expect.objectContaining({ status: 422 }) as Error);
  });
});
