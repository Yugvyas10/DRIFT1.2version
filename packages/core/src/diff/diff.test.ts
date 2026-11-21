import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openApiDocument, reverseKeys } from "../testing/arbitraries.ts";
import { ingestObject, openapi } from "../testing/specs.ts";
import { changeId, diffSpecs } from "./diff.ts";

async function diff(base: unknown, head: unknown) {
  const [b, h] = await Promise.all([ingestObject(base), ingestObject(head)]);
  return diffSpecs(b.ir, h.ir);
}

const body = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });
const ok = (schema?: unknown) => ({
  "200": { description: "ok", ...(schema ? { content: { "application/json": { schema } } } : {}) },
});

describe("diffSpecs", () => {
  it("reports a shared component once per operation and direction that reaches it", async () => {
    const pet = (statuses: string[]) => ({
      type: "object",
      properties: { status: { type: "string", enum: statuses } },
    });
    const doc = (statuses: string[]) =>
      openapi(
        {
          "/pets": {
            post: {
              requestBody: body({ $ref: "#/components/schemas/Pet" }),
              responses: {
                ...ok({ $ref: "#/components/schemas/Pet" }),
                "201": {
                  description: "c",
                  content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
                },
              },
            },
            get: { responses: ok({ type: "array", items: { $ref: "#/components/schemas/Pet" } }) },
          },
        },
        { schemas: { Pet: pet(statuses) } }
      );
    const { changes, impact } = await diff(doc(["a", "b"]), doc(["a"]));
    expect(changes.map((c) => [c.operation, c.direction, c.candidateSeverity])).toEqual([
      ["GET /pets", "response", "SAFE"],
      ["POST /pets", "request", "RISKY"],
      ["POST /pets", "response", "SAFE"],
    ]);
    expect(Object.keys(impact)).toEqual(["GET /pets", "POST /pets"]);
    expect(new Set(changes.map((c) => c.location))).toEqual(
      new Set(["#/components/schemas/Pet/properties/status/enum"])
    );
  });

  it("finds changes inside recursive schemas and terminates", async () => {
    const node = (max: number) => ({
      type: "object",
      properties: { value: { type: "integer", maximum: max }, next: { $ref: "#/components/schemas/Node" } },
    });
    const doc = (max: number) =>
      openapi(
        { "/n": { post: { requestBody: body({ $ref: "#/components/schemas/Node" }), responses: ok() } } },
        { schemas: { Node: node(max) } }
      );
    const { changes } = await diff(doc(10), doc(5));
    expect(changes.map((c) => [c.kind, c.candidateSeverity])).toEqual([["schema.bound.tightened", "RISKY"]]);
  });

  it("does not reuse results cut short by a cycle (mutual recursion reached from different entry points)", async () => {
    const schemas = (max: number) => ({
      A: { type: "object", properties: { b: { $ref: "#/components/schemas/B" } } },
      B: {
        type: "object",
        properties: { a: { $ref: "#/components/schemas/A" }, n: { type: "integer", maximum: max } },
      },
    });
    const doc = (max: number) =>
      openapi(
        {
          "/a": { post: { requestBody: body({ $ref: "#/components/schemas/A" }), responses: ok() } },
          "/b": { post: { requestBody: body({ $ref: "#/components/schemas/B" }), responses: ok() } },
        },
        { schemas: schemas(max) }
      );
    const { changes } = await diff(doc(10), doc(5));
    expect(changes.map((c) => c.operation)).toEqual(["POST /a", "POST /b"]);
  });

  // Regression (M1 fixtures job): Stripe's densely mutually recursive components made the diff exponential,
  // because results inside a cycle were never cached and were recomputed along every path.
  it("stays fast on densely mutually recursive components (Stripe-like expandable fields)", async () => {
    const count = 40;
    const schemas = (max: number) =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `C${String(i)}`,
          {
            type: "object",
            properties: {
              n: { type: "integer", maximum: max },
              ...Object.fromEntries(
                [1, 2, 3, 5, 7].map((step) => [
                  `link${String(step)}`,
                  { anyOf: [{ type: "string" }, { $ref: `#/components/schemas/C${String((i + step) % count)}` }] },
                ])
              ),
            },
          },
        ])
      );
    const doc = (max: number) =>
      openapi(
        Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            `/c${String(i)}`,
            { get: { responses: ok({ $ref: `#/components/schemas/C${String(i * 3)}` }) } },
          ])
        ),
        { schemas: schemas(max) }
      );
    const started = performance.now();
    const same = await diff(doc(10), doc(10));
    const changed = await diff(doc(10), doc(5));
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(same.changes).toEqual([]);
    // Every operation reaches every component, so each reports the one bound change of each component.
    expect(changed.changes).toHaveLength(10 * count);
  }, 60_000);

  it("compares an inlined schema with a referenced one by content", async () => {
    const inline = { type: "object", properties: { id: { type: "string" } } };
    const base = openapi({ "/a": { get: { responses: ok(inline) } } });
    const head = openapi(
      { "/a": { get: { responses: ok({ $ref: "#/components/schemas/Thing" }) } } },
      { schemas: { Thing: inline } }
    );
    expect((await diff(base, head)).changes).toEqual([]);
  });

  it("treats a missing schema as 'anything', so adding one narrows", async () => {
    const base = openapi({ "/a": { post: { requestBody: { content: { "application/json": {} } }, responses: ok() } } });
    const head = openapi({
      "/a": {
        post: { requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: ok() },
      },
    });
    expect((await diff(base, head)).changes.map((c) => c.kind)).toEqual(["schema.type.narrowed"]);
  });

  it("matches a single edited oneOf branch instead of reporting remove + add", async () => {
    const base = openapi({
      "/a": {
        post: {
          requestBody: body({ oneOf: [{ type: "string", maxLength: 5 }, { type: "integer" }] }),
          responses: ok(),
        },
      },
    });
    const head = openapi({
      "/a": {
        post: {
          requestBody: body({ oneOf: [{ type: "string", maxLength: 3 }, { type: "integer" }] }),
          responses: ok(),
        },
      },
    });
    expect((await diff(base, head)).changes.map((c) => c.kind)).toEqual(["schema.bound.tightened"]);
  });

  it("reports added and removed oneOf/anyOf keywords and prefixItems changes (3.1)", async () => {
    const base = openapi(
      { "/a": { post: { requestBody: body({ type: "array", prefixItems: [{ type: "string" }] }), responses: ok() } } },
      {},
      "3.1.0"
    );
    const head = openapi(
      {
        "/a": {
          post: {
            requestBody: body({
              type: "array",
              prefixItems: [{ type: "integer" }, { type: "string" }],
              anyOf: [{ minItems: 1 }],
            }),
            responses: ok(),
          },
        },
      },
      {},
      "3.1.0"
    );
    expect((await diff(base, head)).changes.map((c) => c.kind).sort()).toEqual([
      "schema.composition.changed",
      "schema.composition.changed",
      "schema.type.changed",
    ]);
  });

  it("detects items added or removed on arrays and type removal", async () => {
    const base = openapi({
      "/a": {
        post: { requestBody: body({ type: "array" }), responses: ok({ type: "array", items: { type: "string" } }) },
      },
    });
    const head = openapi({
      "/a": { post: { requestBody: body({ type: "array", items: { type: "string" } }), responses: ok({}) } },
    });
    expect((await diff(base, head)).changes.map((c) => `${c.direction} ${c.kind} ${c.subject ?? ""}`)).toEqual([
      "request schema.bound.tightened items",
      "response schema.bound.relaxed items",
      "response schema.type.widened ",
    ]);
  });

  it("gives a spec with equivalent types (integer | number vs number) no change", async () => {
    const base = openapi({ "/a": { get: { responses: ok({ type: "number" }) } } }, {}, "3.1.0");
    const head = openapi({ "/a": { get: { responses: ok({ type: ["integer", "number"] }) } } }, {}, "3.1.0");
    expect((await diff(base, head)).changes).toEqual([]);
  });

  it("reports enum introduced, removed and additionalProperties schema changes", async () => {
    const base = openapi({
      "/a": {
        post: {
          requestBody: body({
            type: "object",
            additionalProperties: { type: "string" },
            properties: { c: { type: "string", enum: ["x"] } },
          }),
          responses: ok(),
        },
      },
    });
    const head = openapi({
      "/a": {
        post: {
          requestBody: body({
            type: "object",
            additionalProperties: { type: "string", maxLength: 3 },
            properties: { c: { type: "string" } },
          }),
          responses: ok(),
        },
      },
    });
    expect((await diff(base, head)).changes.map((c) => `${c.kind} ${c.subject ?? ""}`)).toEqual([
      "schema.bound.tightened maxLength",
      "schema.bound.relaxed enum",
    ]);
  });

  it("builds ids from what identifies a change, not from the message or values", () => {
    const base = {
      kind: "schema.property.removed",
      direction: "request",
      operation: "GET /a",
      location: "#/x",
      subject: "p",
    } as const;
    expect(changeId(base)).toMatch(/^[0-9a-f]{16}$/);
    expect(changeId(base)).toBe(changeId({ ...base }));
    expect(changeId(base)).not.toBe(changeId({ ...base, direction: "response" }));
    expect(changeId(base)).not.toBe(changeId({ ...base, subject: undefined }));
  });
});

/** Each run ingests two random specs, so these take seconds; give them room on slow or busy CI runners. */
const PROPERTY_TIMEOUT_MS = 120_000;

describe("diffSpecs — properties over random specs", () => {
  it(
    "finds no changes between a spec and itself, or a key-reordered copy, and hashes them equally",
    async () => {
      await fc.assert(
        fc.asyncProperty(openApiDocument, async (document) => {
          const [a, b] = await Promise.all([ingestObject(document), ingestObject(reverseKeys(document))]);
          expect(a.specHash).toBe(b.specHash);
          expect(diffSpecs(a.ir, a.ir).changes).toEqual([]);
          expect(diffSpecs(a.ir, b.ir).changes).toEqual([]);
        }),
        { numRuns: 60 }
      );
    },
    PROPERTY_TIMEOUT_MS
  );

  it(
    "is deterministic, with unique ids and a consistent impact index",
    async () => {
      await fc.assert(
        fc.asyncProperty(openApiDocument, openApiDocument, async (x, y) => {
          const [a, b] = await Promise.all([ingestObject(x), ingestObject(y)]);
          const first = diffSpecs(a.ir, b.ir);
          expect(diffSpecs(a.ir, b.ir)).toEqual(first);
          const ids = first.changes.map((c) => c.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(Object.values(first.impact).flat().sort()).toEqual([...ids].sort());
        }),
        { numRuns: 60 }
      );
    },
    PROPERTY_TIMEOUT_MS
  );

  it(
    "always reports an added required query parameter as RISKY",
    async () => {
      await fc.assert(
        fc.asyncProperty(openApiDocument, async (document) => {
          const mutated = structuredClone(document) as {
            paths: Record<string, Record<string, { parameters?: unknown[] }>>;
          };
          const [path, item] = Object.entries(mutated.paths)[0] ?? [];
          const [method, op] = Object.entries(item ?? {}).find(([key]) => key !== "parameters") ?? [];
          if (!path || !method || !op) return;
          op.parameters = [
            ...(op.parameters ?? []),
            { name: "mandatory", in: "query", required: true, schema: { type: "string" } },
          ];
          const { changes } = await diff(document, mutated);
          expect(changes).toContainEqual(
            expect.objectContaining({ kind: "param.added.required", candidateSeverity: "RISKY" })
          );
        }),
        { numRuns: 40 }
      );
    },
    PROPERTY_TIMEOUT_MS
  );
});
