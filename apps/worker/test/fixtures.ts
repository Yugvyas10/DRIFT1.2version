import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDb, newId, type Db } from "@drift/db";
import {
  artifactKey,
  createLogger,
  createRedis,
  createS3Store,
  readRunEvents,
  type Logger,
  type ObjectStore,
  type Redis,
  type RunEvent,
  type S3Settings,
} from "@drift/platform";
import { inject } from "vitest";

const examples = new URL("../../../examples/", import.meta.url);
export const example = (path: string) => readFile(new URL(path, examples), "utf8");

export interface Services {
  db: Db;
  redis: Redis;
  store: ObjectStore;
  s3: S3Settings;
  log: Logger;
}

/** Clients for the containers of test/global-setup.ts. Logs are kept quiet unless DEBUG_WORKER is set. */
export function services(): Services {
  const s3 = inject("s3");
  return {
    db: createDb(inject("databaseUrl")),
    redis: createRedis(inject("redisUrl")),
    store: createS3Store(s3),
    s3,
    log: createLogger({ service: "drift-worker-test", level: process.env.DEBUG_WORKER ? "debug" : "silent" }),
  };
}

export async function closeServices(s: Services): Promise<void> {
  await s.db.$disconnect();
  s.redis.disconnect();
}

/** A new organisation with one project. */
export async function seedOrg(db: Db): Promise<{ orgId: string; projectId: string }> {
  const orgId = newId("organization");
  const projectId = newId("project");
  await db.organization.create({ data: { id: orgId, slug: orgId.replace("_", "-"), name: "Test org" } });
  await db.project.create({ data: { id: projectId, orgId, slug: "petstore", name: "Petstore" } });
  return { orgId, projectId };
}

export interface InputFile {
  name: string;
  text: string;
}

export interface RunSetup {
  orgId: string;
  projectId: string;
  base: InputFile;
  head: InputFile;
  traffic?: InputFile & { format: "jsonl" | "har" };
  parentRunId?: string;
  failOn?: "breaking" | "risky";
  /** A drift-rules/v1 ruleset (or anything, to test that a bad one is refused). */
  rules?: unknown;
}

/**
 * A queued server-side run whose inputs are in storage, as the web API leaves it when every upload is complete
 * (apps/web/src/server/services/server-runs.ts).
 */
export async function queuedRun(s: Services, setup: RunSetup): Promise<string> {
  const runId = newId("run");
  const inputs = [
    { kind: "input-base", file: setup.base, contentType: "application/yaml" },
    { kind: "input-head", file: setup.head, contentType: "application/yaml" },
    ...(setup.traffic ? [{ kind: "input-traffic", file: setup.traffic, contentType: "application/x-ndjson" }] : []),
  ];
  const stored = [];
  for (const input of inputs) {
    const sha256 = createHash("sha256").update(input.file.text).digest("hex");
    await s.store.putText(artifactKey(setup.orgId, sha256), input.file.text, input.contentType);
    stored.push({ ...input, sha256, size: Buffer.byteLength(input.file.text) });
  }
  await s.db.run.create({
    data: {
      id: runId,
      orgId: setup.orgId,
      projectId: setup.projectId,
      status: "QUEUED",
      mode: "SERVER",
      trigger: "MANUAL",
      idempotencyKey: runId,
      requestHash: runId,
      commit: "0".repeat(40),
      parentRunId: setup.parentRunId ?? null,
      options: {
        base: { name: setup.base.name },
        head: { name: setup.head.name },
        ...(setup.traffic ? { traffic: { name: setup.traffic.name, format: setup.traffic.format } } : {}),
        ...(setup.failOn ? { failOn: setup.failOn } : {}),
        ...(setup.rules === undefined ? {} : { rules: setup.rules as Record<string, never> }),
      },
      artifacts: {
        create: stored.map((input) => ({
          id: newId("artifact"),
          orgId: setup.orgId,
          kind: input.kind,
          sha256: input.sha256,
          size: input.size,
          contentType: input.contentType,
          storageKey: artifactKey(setup.orgId, input.sha256),
          verifiedAt: new Date(),
        })),
      },
    },
  });
  return runId;
}

export async function petstore(): Promise<{ v1: InputFile; v2: InputFile; traffic: InputFile & { format: "jsonl" } }> {
  return {
    v1: { name: "v1.yaml", text: await example("petstore/v1.yaml") },
    v2: { name: "v2-breaking.yaml", text: await example("petstore/v2-breaking.yaml") },
    traffic: { name: "traffic.jsonl", text: await example("petstore/traffic.jsonl"), format: "jsonl" },
  };
}

/** The run's events so far, without their stream ids. */
export async function events(redis: Redis, runId: string): Promise<RunEvent[]> {
  return (await readRunEvents(redis, runId)).map((stored) => stored.event);
}

/** Waits until the run's events include one that matches. */
export async function waitForEvent(
  redis: Redis,
  runId: string,
  match: (event: RunEvent) => boolean,
  timeoutMs = 30_000
): Promise<RunEvent> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await events(redis, runId)).find(match);
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`run ${runId}: no matching event within ${String(timeoutMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export const settled = (event: RunEvent) =>
  event.type === "run.completed" || (event.type === "run.failed" && !event.willRetry);
