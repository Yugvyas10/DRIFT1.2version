import { describe, expect, it, vi } from "vitest";
import { describeError, runWorker, type RedisProbe, type WorkerDeps } from "./worker.ts";

function setup(ping: () => Promise<string>) {
  const logs: { level: string; fields: Record<string, unknown>; message: string }[] = [];
  const stderr: string[] = [];
  const disconnect = vi.fn();
  const redis: RedisProbe = { ping: vi.fn(ping), disconnect };
  const deps: WorkerDeps = {
    createRedis: vi.fn(() => redis),
    createLogger: () => ({
      info: (fields, message) => logs.push({ level: "info", fields, message }),
      error: (fields, message) => logs.push({ level: "error", fields, message }),
    }),
    writeStderr: (text) => stderr.push(text),
  };
  return { deps, redis, disconnect, logs, stderr };
}

describe("runWorker", () => {
  it("exits 0 when Redis answers, and says honestly that no processors exist yet", async () => {
    const t = setup(() => Promise.resolve("PONG"));
    expect(await runWorker({ REDIS_URL: "redis://:pw@localhost:6379" }, t.deps)).toBe(0);
    expect(t.logs.map((l) => l.message)).toEqual([
      "redis reachable",
      "no job processors are registered yet; queues arrive in M6 (docs/PLAN.md)",
    ]);
    expect(t.disconnect).toHaveBeenCalledOnce();
  });

  it("exits 1 when Redis is unreachable and never logs credentials", async () => {
    const t = setup(() => Promise.reject(new Error("connect ECONNREFUSED")));
    expect(await runWorker({ REDIS_URL: "redis://:pw@localhost:6379" }, t.deps)).toBe(1);
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]).toMatchObject({ level: "error", message: "redis unreachable" });
    expect(JSON.stringify(t.logs)).not.toContain("pw");
    expect(t.disconnect).toHaveBeenCalledOnce();
  });

  it("exits 1 with a readable message when the environment is invalid", async () => {
    const t = setup(() => Promise.resolve("PONG"));
    expect(await runWorker({}, t.deps)).toBe(1);
    expect(t.stderr.join("")).toContain("REDIS_URL");
    expect(t.deps.createRedis).not.toHaveBeenCalled();
  });

  it("reports rejections that are not Error instances", async () => {
    // A misbehaving client library could reject with a plain value; the worker must still log it.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const t = setup(() => Promise.reject("timeout"));
    expect(await runWorker({ REDIS_URL: "redis://localhost:6379" }, t.deps)).toBe(1);
    expect(t.logs[0]?.fields.reason).toBe("timeout");
  });
});

describe("describeError", () => {
  it("uses the message when there is one", () => {
    expect(describeError(new Error("connect timeout"))).toBe("connect timeout");
  });

  it("falls back to the error code for network errors with an empty message", () => {
    const error = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    expect(describeError(error)).toBe("ECONNREFUSED");
  });

  it("falls back to the error name when there is neither", () => {
    expect(describeError(new TypeError(""))).toBe("TypeError");
  });
});
