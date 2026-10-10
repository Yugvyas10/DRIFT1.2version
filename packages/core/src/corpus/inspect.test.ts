import { describe, expect, it } from "vitest";
import { ingestObject, openapi } from "../testing/specs.ts";
import { inspectTraffic } from "./inspect.ts";
import type { TrafficEntry } from "./traffic.ts";

const entries: TrafficEntry[] = [
  {
    line: 1,
    record: { method: "GET", path: "/pets/7", status: 200, headers: { Authorization: "Bearer abcdefghijkl" } },
  },
  { line: 2, record: { method: "GET", path: "/users/alice@example.com", status: 404 } },
  { line: 3, malformed: "not valid JSON" },
  { line: 4, record: { method: "POST", path: "/pets", requestBody: { password: "x", name: "Rex" } } },
];

describe("inspectTraffic", () => {
  it("counts records by path as sent, redacted, when there is no spec", async () => {
    const result = await inspectTraffic(entries);
    expect(result).toEqual({
      read: 4,
      malformed: 1,
      malformedExamples: [{ line: 3, reason: "not valid JSON" }],
      operations: { "GET /pets/7": 1, "GET /users/[REDACTED:path]": 1, "POST /pets": 1 },
      unrouted: 0,
      // The email in the path is redacted in the key above; without a spec it is not a parameter, so not counted.
      redaction: { records: 2, values: 2, pointers: { "/headers/authorization": 1, "/body/password": 1 } },
      statuses: { "200": 1, "404": 1 },
    });
  });

  it("routes records against a spec and counts what matches no operation", async () => {
    const ok = { responses: { "200": { description: "ok" } } };
    const spec = await ingestObject(
      openapi({
        "/pets/{id}": {
          get: { ...ok, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
        },
      })
    );
    const result = await inspectTraffic(entries, spec.ir, 0);
    expect(result.operations).toEqual({ "GET /pets/{}": 1 });
    expect(result.unrouted).toBe(2);
    expect(result.malformedExamples).toEqual([]);
  });
});
