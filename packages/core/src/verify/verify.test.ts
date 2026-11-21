import type { TrafficRecord } from "@drift/report-schema";
import { describe, expect, it } from "vitest";
import { buildCorpus } from "../corpus/corpus.ts";
import { diffSpecs, type DiffResult } from "../diff/diff.ts";
import type { SpecIR } from "../ingest/ir.ts";
import { ingestObject, openapi } from "../testing/specs.ts";
import { isUnknown, matchMedia, verify, type Evidence } from "./verify.ts";

type Doc = ReturnType<typeof openapi>;

async function run(
  base: Doc,
  head: Doc,
  records: TrafficRecord[] = [],
  edit?: (diff: DiffResult) => DiffResult,
  mutate?: (head: SpecIR) => void
) {
  const [b, h] = await Promise.all([ingestObject(base), ingestObject(head)]);
  mutate?.(h.ir);
  const diff = diffSpecs(b.ir, h.ir);
  const entries = records.map((record, index) => ({ line: index + 1, record }));
  const corpus = await buildCorpus(entries, b.ir, new Set(Object.keys(diff.impact)));
  const effective = edit ? edit(diff) : diff;
  const result = verify(b.ir, h.ir, effective, corpus.samples);
  const byKind = (kind: string, direction?: string): Evidence => {
    const change = diff.changes.find((c) => c.kind === kind && (direction === undefined || c.direction === direction));
    if (!change) throw new Error(`no ${kind} change; got ${diff.changes.map((c) => c.kind).join(", ")}`);
    const evidence = result.evidence[change.id];
    if (!evidence) throw new Error("no evidence entry");
    return evidence;
  };
  return { diff, result, byKind };
}

const ok = { "200": { description: "ok" } };
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const post = (schema: unknown, extra: Record<string, unknown> = {}) =>
  openapi({ "/pets": { post: { requestBody: { required: true, ...json(schema) }, responses: ok, ...extra } } });
const get = (parameters: unknown[]) => openapi({ "/pets": { get: { parameters, responses: ok } } });
const reply = (schema: unknown) =>
  openapi({ "/pets": { get: { responses: { "200": { description: "ok", ...json(schema) } } } } });

const failedSynthetic = (evidence: Evidence) => evidence.failed.synthetic;

describe("verify: request evidence from synthetic samples", () => {
  it("proves a removed enum value with the removed value", async () => {
    const pet = (values: string[]) => ({ type: "object", properties: { status: { type: "string", enum: values } } });
    const { byKind } = await run(post(pet(["a", "b"])), post(pet(["a"])));
    const evidence = byKind("schema.enum.value_removed");
    expect(failedSynthetic(evidence)).toBeGreaterThan(0);
    expect(evidence.examples[0]).toMatchObject({
      origin: "synthetic",
      payload: { method: "POST", path: "/pets", body: { status: "b" } },
      errors: [{ pointer: "/body/status", keyword: "enum" }],
    });
  });

  it("proves tightened bounds, narrowed types, changed formats and closed objects", async () => {
    const schema = (props: Record<string, unknown>, closed = false) => ({
      type: "object",
      properties: props,
      ...(closed ? { additionalProperties: false } : {}),
    });
    const base = post(
      schema({
        n: { type: "integer", maximum: 100 },
        t: { type: "string", nullable: true },
        e: { type: "string", format: "email" },
      })
    );
    const head = post(
      schema(
        { n: { type: "integer", maximum: 50 }, t: { type: "string" }, e: { type: "string", format: "uuid" } },
        true
      )
    );
    const { byKind } = await run(base, head);
    expect(failedSynthetic(byKind("schema.bound.tightened"))).toBeGreaterThan(0);
    expect(failedSynthetic(byKind("schema.type.narrowed"))).toBeGreaterThan(0);
    expect(failedSynthetic(byKind("schema.format.changed"))).toBeGreaterThan(0);
    expect(failedSynthetic(byKind("schema.additional_properties.tightened"))).toBeGreaterThan(0);
  });

  it("proves new required properties, and removed properties only when the new schema is closed", async () => {
    const base = post({ type: "object", properties: { a: { type: "string" }, b: { type: "string" } } });
    const open = post({
      type: "object",
      required: ["c"],
      properties: { a: { type: "string" }, c: { type: "string" } },
    });
    const closed = post({
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
    });
    const first = await run(base, open);
    expect(failedSynthetic(first.byKind("schema.property.added.required"))).toBeGreaterThan(0);
    const removed = first.byKind("schema.property.removed");
    expect(removed.failed).toEqual({ recorded: 0, synthetic: 0 });
    expect(removed.checked.synthetic).toBeGreaterThan(0);
    const second = await run(base, closed);
    expect(failedSynthetic(second.byKind("schema.property.removed"))).toBeGreaterThan(0);
  });

  it("proves a removed oneOf alternative", async () => {
    const variants = (branches: unknown[]) => ({ oneOf: branches });
    const { byKind } = await run(
      post(variants([{ type: "string" }, { type: "integer" }])),
      post(variants([{ type: "string" }]))
    );
    expect(failedSynthetic(byKind("schema.variant.removed"))).toBeGreaterThan(0);
  });

  it("proves required parameters, required bodies, removed media types and removed operations", async () => {
    const param = (required: boolean) => ({ name: "q", in: "query", required, schema: { type: "string" } });
    const madeRequired = await run(get([param(false)]), get([param(true)]));
    expect(failedSynthetic(madeRequired.byKind("param.made_required"))).toBeGreaterThan(0);
    const added = await run(get([]), get([param(true)]));
    expect(failedSynthetic(added.byKind("param.added.required"))).toBeGreaterThan(0);

    const body = (required: boolean, types = ["application/json"]) =>
      openapi({
        "/pets": {
          post: {
            requestBody: {
              required,
              content: Object.fromEntries(types.map((t) => [t, { schema: { type: "object" } }])),
            },
            responses: ok,
          },
          delete: { responses: ok },
        },
      });
    const noBody = openapi({ "/pets": { post: { responses: ok }, delete: { responses: ok } } });
    expect(failedSynthetic((await run(body(false), body(true))).byKind("request.body.made_required"))).toBeGreaterThan(
      0
    );
    expect(failedSynthetic((await run(noBody, body(true))).byKind("request.body.added.required"))).toBeGreaterThan(0);
    const media = await run(body(true, ["application/json", "text/plain"]), body(true, ["text/plain"]));
    expect(failedSynthetic(media.byKind("media_type.removed", "request"))).toBeGreaterThan(0);
    const gone = await run(body(false), openapi({ "/pets": { post: { responses: ok } } }));
    expect(failedSynthetic(gone.byKind("operation.removed"))).toBeGreaterThan(0);
  });
});

describe("verify: response evidence", () => {
  it("proves an added response enum value, and an added property when the old schema was closed", async () => {
    const pet = (values: string[], props: Record<string, unknown> = {}) => ({
      type: "object",
      additionalProperties: false,
      properties: { status: { type: "string", enum: values }, ...props },
    });
    const { byKind, result } = await run(reply(pet(["a"])), reply(pet(["a", "b"], { tag: { type: "string" } })));
    expect(failedSynthetic(byKind("schema.enum.value_added", "response"))).toBeGreaterThan(0);
    expect(failedSynthetic(byKind("schema.property.added.optional", "response"))).toBeGreaterThan(0);
    expect(result.synthetic.generated).toBeGreaterThan(0);
  });

  it("proves a response property that became optional", async () => {
    const pet = (required: string[]) => ({
      type: "object",
      ...(required.length > 0 ? { required } : {}),
      properties: { id: { type: "integer" } },
    });
    const { byKind } = await run(reply(pet(["id"])), reply(pet([])));
    expect(failedSynthetic(byKind("schema.property.made_optional", "response"))).toBeGreaterThan(0);
  });

  it("does not generate responses for statuses or media types the old contract lacks", async () => {
    const base = openapi({
      "/pets": { get: { responses: { "201": { description: "x", ...json({ type: "string" }) } } } },
    });
    const head = reply({ type: "string" });
    const { result } = await run(base, head);
    expect(result.synthetic).toEqual({ generated: 0, discarded: 0 });
  });
});

describe("verify: recorded traffic", () => {
  const pet = (values: string[]) => post({ type: "object", properties: { status: { type: "string", enum: values } } });
  const record = (body: unknown, extra: Partial<TrafficRecord> = {}): TrafficRecord => ({
    method: "POST",
    path: "/pets",
    headers: { "content-type": "application/json" },
    requestBody: body as never,
    ...extra,
  });

  it("uses recorded samples as evidence and does not synthesise for operations they reach", async () => {
    const { byKind, result } = await run(pet(["a", "b"]), pet(["a"]), [
      record({ status: "b" }),
      record({ status: "a" }),
    ]);
    const evidence = byKind("schema.enum.value_removed");
    expect(evidence.checked).toEqual({ recorded: 2, synthetic: 0 });
    expect(evidence.failed).toEqual({ recorded: 1, synthetic: 0 });
    expect(evidence.examples[0]).toMatchObject({ sample: "r:1", origin: "recorded", line: 1 });
    expect(result.synthetic).toEqual({ generated: 0, discarded: 0 });
  });

  it("treats failures at redacted values as unknown, never as failing", async () => {
    const schema = (format: string) => post({ type: "object", properties: { contact: { type: "string", format } } });
    const { byKind } = await run(schema("email"), schema("uuid"), [record({ contact: "alice@example.com" })]);
    const evidence = byKind("schema.format.changed");
    expect(evidence.failed).toEqual({ recorded: 0, synthetic: 0 });
    expect(evidence.unknown).toBe(1);
  });

  it("counts recorded requests the old contract already rejects as non-conformance, not evidence", async () => {
    const { byKind, result } = await run(pet(["a", "b"]), pet(["a"]), [record({ status: "zzz" })]);
    expect(result.nonConformance.requests).toBe(1);
    expect(byKind("schema.enum.value_removed").checked).toEqual({ recorded: 0, synthetic: 0 });
  });

  it("checks recorded responses against the new contract, for information", async () => {
    const schema = (values: string[]) => reply({ type: "string", enum: values });
    const response = (body: string): TrafficRecord => ({
      method: "GET",
      path: "/pets",
      status: 200,
      responseHeaders: { "content-type": "application/json" },
      responseBody: body,
    });
    const { result } = await run(schema(["a", "b"]), schema(["a", "c"]), [
      response("b"),
      response("a"),
      { method: "GET", path: "/pets", status: 404, responseBody: "x" },
    ]);
    expect(result.nonConformance.responses).toBe(1);
  });

  it("reads path, header and cookie parameters from recorded requests", async () => {
    const spec = (max: number) =>
      openapi({
        "/pets/{id}": {
          get: {
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "integer", maximum: max } },
              { name: "X-Page", in: "header", schema: { type: "integer", maximum: max } },
              { name: "session", in: "cookie", schema: { type: "integer", maximum: max } },
              { name: "Accept", in: "header", required: true, schema: { type: "string" } },
            ],
            responses: ok,
          },
        },
      });
    const { diff, result } = await run(spec(100), spec(10), [
      { method: "GET", path: "/pets/50", headers: { "X-Page": "50" } },
      { method: "GET", path: "/pets/5" },
    ]);
    const failed = diff.changes.map((change) => result.evidence[change.id]?.failed.recorded);
    expect(failed).toEqual([1, 1, 0]);
  });
});

describe("verify: reporting what it cannot explain or check", () => {
  it("reports failures no change explains as unattributed", async () => {
    const pet = (values: string[]) =>
      post({ type: "object", properties: { status: { type: "string", enum: values } } });
    const { result } = await run(pet(["a", "b"]), pet(["a"]), [], (diff) => ({
      ...diff,
      anchors: Object.fromEntries(Object.keys(diff.anchors).map((id) => [id, []])),
    }));
    expect(result.unattributed).toHaveLength(1);
    expect(result.unattributed[0]).toMatchObject({ operation: "POST /pets", direction: "request" });
    expect(result.unattributed[0]?.count).toBeGreaterThan(0);
  });

  it("notes schemas that cannot be compiled", async () => {
    // Ingest rejects invalid patterns, so the head IR is edited directly to reach this safety net.
    const schema = (pattern: string) => post({ type: "object", properties: { a: { type: "string", pattern } } });
    const { result } = await run(schema("^a"), schema("^b"), [], undefined, (head) => {
      const body = head.operations["POST /pets"]?.requestBody?.content["application/json"]?.schema;
      const a = (body?.properties as Record<string, Record<string, unknown>> | undefined)?.a;
      if (a) a.pattern = "(unclosed";
    });
    expect(result.notes).toEqual([
      expect.stringContaining("new contract: request POST /pets|body:application/json could not be checked"),
    ]);
  });

  it("compiles each validator at most once however many samples it checks", async () => {
    const pet = (values: string[]) =>
      post({ type: "object", properties: { status: { type: "string", enum: values } } });
    const records = Array.from({ length: 30 }, (_, index): TrafficRecord => ({
      method: "POST",
      path: "/pets",
      requestBody: { status: index % 2 === 0 ? "a" : "b" },
    }));
    const { result } = await run(pet(["a", "b"]), pet(["a"]), records);
    expect(result.compiled).toEqual({ base: 1, head: 1 });
  });
});

describe("helpers", () => {
  it("matches media types exactly, then by type, then any", () => {
    expect(matchMedia("application/json", ["application/*", "application/json"])).toBe("application/json");
    expect(matchMedia("application/xml", ["*/*", "application/*"])).toBe("application/*");
    expect(matchMedia("image/png", ["*/*"])).toBe("*/*");
    expect(matchMedia("image/png", ["text/plain"])).toBeUndefined();
  });

  it("treats failures above a redacted value as unknown only for keywords that look at nested values", () => {
    const failure = (pointer: string, keyword: string) => ({ at: "body" as const, pointer, keyword, message: "" });
    const redacted = ["/body/owner/email"];
    expect(isUnknown(failure("/body/owner/email", "format"), redacted)).toBe(true);
    expect(isUnknown(failure("/body/owner", "oneOf"), redacted)).toBe(true);
    expect(isUnknown(failure("/body/owner", "required"), redacted)).toBe(false);
    expect(isUnknown(failure("/cookies/sid", "type"), ["/headers/cookie"])).toBe(true);
  });
});
