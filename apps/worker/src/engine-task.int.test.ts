import { createHash } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { stageKey } from "@drift/core";
import { newId } from "@drift/db";
import { artifactKey, stageCacheKey } from "@drift/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeServices, example, petstore, services, type InputFile, type Services } from "../test/fixtures.ts";
import runEngine, { type EngineTask, type StageMessage } from "./engine-task.ts";

let s: Services;
let files: Awaited<ReturnType<typeof petstore>>;

beforeAll(async () => {
  s = services();
  files = await petstore();
});

afterAll(() => closeServices(s));

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Stores the files under a new organisation and runs the engine on them in this thread. */
async function run(
  inputs: { base: InputFile; head: InputFile; traffic?: InputFile & { format: "jsonl" | "har" } },
  options: { orgId?: string; skipUpload?: string[] } = {}
) {
  const orgId = options.orgId ?? newId("organization");
  const file = async (input: InputFile) => {
    const hash = sha256(input.text);
    if (!options.skipUpload?.includes(input.name))
      await s.store.putText(artifactKey(orgId, hash), input.text, "text/plain");
    return { key: artifactKey(orgId, hash), name: input.name, sha256: hash };
  };
  const { port1, port2 } = new MessageChannel();
  const messages: Exclude<StageMessage, { status: "end" }>[] = [];
  port1.on("message", (message: StageMessage) => {
    if (message.status !== "end") messages.push(message);
  });
  const task: EngineTask = {
    orgId,
    s3: s.s3,
    base: await file(inputs.base),
    head: await file(inputs.head),
    ...(inputs.traffic ? { traffic: { ...(await file(inputs.traffic)), format: inputs.traffic.format } } : {}),
    asOf: "2026-10-03",
    port: port2,
  };
  const ended = new Promise<void>((resolve) => {
    port1.on("message", (message: StageMessage) => {
      if (message.status === "end") resolve();
    });
  });
  const result = await runEngine(task);
  await ended;
  port1.close();
  return { result, messages, orgId };
}

describe("the engine task", () => {
  it("gives the same result as `drift compare` on the petstore example", async () => {
    const { result, messages } = await run({ base: files.v1, head: files.v2, traffic: files.traffic });
    if (!result.ok) throw new Error(result.message);
    const expected = JSON.parse(await example("petstore/expected.json")) as {
      summary: unknown;
      semver: string;
      changes: { id: string; severity: string }[];
    };
    expect(result.report.summary).toEqual(expected.summary);
    expect(result.report.semver).toBe(expected.semver);
    expect(result.report.changes.map((change) => [change.id, change.severity])).toEqual(
      expected.changes.map((change) => [change.id, change.severity])
    );
    expect(result.report.base.file).toBe("v1.yaml");
    expect(messages.filter((message) => message.status === "finished")).toHaveLength(6);
  });

  it("reads HAR traffic, and reports a HAR file that is not JSON as an input error", async () => {
    const har = {
      log: {
        entries: [
          {
            request: { method: "GET", url: "https://api.example.com/pets/1", headers: [] },
            response: {
              status: 200,
              headers: [{ name: "content-type", value: "application/json" }],
              content: { text: '{"id":1,"name":"Rex"}' },
            },
          },
        ],
      },
    };
    const ok = await run({
      base: files.v1,
      head: files.v2,
      traffic: { name: "traffic.har", text: JSON.stringify(har), format: "har" },
    });
    if (!ok.result.ok) throw new Error(ok.result.message);
    expect(ok.result.report.corpus.source).toEqual({ kind: "har", file: "traffic.har" });
    expect(ok.result.report.corpus.recorded.read).toBe(1);

    const bad = await run({
      base: files.v1,
      head: files.v2,
      traffic: { name: "broken.har", text: "{not json", format: "har" },
    });
    expect(bad.result).toEqual({
      ok: false,
      category: "invalid_input",
      message: "broken.har is not a HAR file (it is not JSON).",
    });
  });

  it("reports inputs missing from storage as input errors", async () => {
    const noHead = await run(
      { base: files.v1, head: { name: "gone.yaml", text: "openapi: 3.1.0" } },
      { skipUpload: ["gone.yaml"] }
    );
    expect(noHead.result).toEqual({
      ok: false,
      category: "invalid_input",
      message: "The head contract is missing from storage.",
    });

    for (const format of ["jsonl", "har"] as const) {
      const noTraffic = await run(
        { base: files.v1, head: files.v2, traffic: { name: `gone.${format}`, text: `missing ${format}`, format } },
        { skipUpload: [`gone.${format}`] }
      );
      expect(noTraffic.result).toEqual({
        ok: false,
        category: "invalid_input",
        message: "The traffic file is missing from storage.",
      });
    }
  });

  it("reports every problem of an invalid contract in one message", async () => {
    const invalid = { name: "missing-info.yaml", text: await example("invalid/missing-info.yaml") };
    const { result } = await run({ base: invalid, head: files.v2 });
    expect(result).toMatchObject({ ok: false, category: "invalid_spec" });
    expect(!result.ok && result.message).toMatch(
      /^The base contract \(missing-info\.yaml\) is not a valid OpenAPI document: missing-info\.yaml/
    );
  });

  it("treats a damaged cache entry as a miss and computes the stage again", async () => {
    const orgId = newId("organization");
    await s.store.putText(
      stageCacheKey(orgId, stageKey("ingest.file", { sha256: sha256(files.v1.text), name: files.v1.name })),
      "{damaged",
      "application/json"
    );
    const { result, messages } = await run({ base: files.v1, head: files.v2 }, { orgId });
    expect(result.ok).toBe(true);
    expect(messages.find((message) => message.stage === "ingest.base" && message.status === "finished")).toMatchObject({
      cacheHit: false,
    });

    // The entry was rewritten, so the next run hits it.
    const again = await run({ base: files.v1, head: files.v2 }, { orgId });
    expect(again.messages.filter((message) => message.status === "finished").every((message) => message.cacheHit)).toBe(
      true
    );
  });
});
