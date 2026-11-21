import { Writable } from "node:stream";
import { createLogger } from "@drift/platform";
import { describe, expect, it, vi } from "vitest";
import { checkServices, runWorker, type Services, type WorkerDeps } from "./worker.ts";

const ENV = {
  REDIS_URL: "redis://:redis-password@cache.internal:6380",
  DATABASE_URL: "postgresql://drift:db-password@localhost:5432/drift",
  S3_ENDPOINT: "http://localhost:8333",
  S3_BUCKET: "drift-artifacts",
  S3_ACCESS_KEY_ID: "drift",
  S3_SECRET_ACCESS_KEY: "s3-password",
};

function fakeServices(fail: { database?: unknown; redis?: unknown; storage?: unknown } = {}) {
  // A client library may reject with anything, not only an Error.
  const answer = (failure: unknown) =>
    vi.fn(() =>
      failure === undefined
        ? Promise.resolve("ok")
        : // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          Promise.reject(failure)
    );
  return {
    db: { $queryRaw: answer(fail.database), $disconnect: vi.fn(() => Promise.resolve()) },
    redis: { ping: answer(fail.redis), disconnect: vi.fn() },
    store: { ping: answer(fail.storage) },
  };
}

function setup(services = fakeServices(), argv: string[] = []) {
  const lines: Record<string, unknown>[] = [];
  const stderr: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  let stop!: (signal: string) => void;
  const close = vi.fn(() => Promise.resolve());
  const shutdown = vi.fn(() => Promise.resolve());
  const deps: WorkerDeps = {
    createLogger: (level) => createLogger({ service: "drift-worker", level, destination }),
    connect: vi.fn(() => services as unknown as Services),
    startTracing: vi.fn(() => ({ shutdown })),
    startRunWorker: vi.fn(() => ({ close })),
    stopSignal: () =>
      new Promise((resolve) => {
        stop = resolve;
      }),
    writeStderr: (text) => stderr.push(text),
  };
  return {
    deps,
    services,
    lines,
    stderr,
    close,
    shutdown,
    stop: (signal: string) => {
      stop(signal);
    },
    run: (source: Record<string, string> = ENV) => runWorker(argv, source, deps),
  };
}

describe("runWorker", () => {
  it("consumes the queue until SIGTERM, then closes the worker, tracing and connections and exits 0", async () => {
    const t = setup();
    const exit = t.run({ ...ENV, WORKER_CONCURRENCY: "3", OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" });
    await vi.waitFor(() => {
      expect(t.deps.startRunWorker).toHaveBeenCalledOnce();
    });
    expect(t.deps.startTracing).toHaveBeenCalledWith("http://localhost:4318");
    expect(t.deps.startRunWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrency: 3,
        orgConcurrency: 2,
        runTimeoutMs: 600_000,
        s3: expect.objectContaining({ bucket: "drift-artifacts", region: "us-east-1" }) as unknown,
      })
    );
    expect(t.close).not.toHaveBeenCalled();

    t.stop("SIGTERM");
    expect(await exit).toBe(0);
    expect(t.close).toHaveBeenCalledOnce();
    expect(t.shutdown).toHaveBeenCalledOnce();
    expect(t.services.db.$disconnect).toHaveBeenCalledOnce();
    expect(t.services.redis.disconnect).toHaveBeenCalledOnce();
    expect(t.lines.map((line) => line.msg)).toEqual([
      "worker started",
      "stopping: finishing the runs in progress",
      "worker stopped",
    ]);
    expect(t.lines[1]).toMatchObject({ signal: "SIGTERM" });
  });

  it("with --check, exits 0 when every dependency answers, without consuming the queue", async () => {
    const t = setup(fakeServices(), ["--check"]);
    expect(await t.run()).toBe(0);
    expect(t.deps.startRunWorker).not.toHaveBeenCalled();
    expect(t.deps.startTracing).not.toHaveBeenCalled();
    expect(t.lines).toEqual([
      expect.objectContaining({ msg: "database, redis and storage reachable", redis: "cache.internal:6380" }),
    ]);
    expect(t.services.redis.disconnect).toHaveBeenCalledOnce();
  });

  it("exits 1 when a dependency is unreachable, names it, and never logs credentials", async () => {
    const t = setup(fakeServices({ redis: new Error("connect ECONNREFUSED"), storage: "timeout" }));
    expect(await t.run()).toBe(1);
    expect(t.deps.startRunWorker).not.toHaveBeenCalled();
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]).toMatchObject({
      level: "error",
      msg: "dependencies unreachable",
      down: [
        { service: "redis", reason: "connect ECONNREFUSED" },
        { service: "storage", reason: "timeout" },
      ],
    });
    const output = JSON.stringify(t.lines);
    for (const secret of ["redis-password", "db-password", "s3-password"]) expect(output).not.toContain(secret);
    expect(t.services.db.$disconnect).toHaveBeenCalledOnce();
  });

  it("exits 1 with a readable message when the environment is invalid, before connecting", async () => {
    const t = setup();
    expect(await t.run({})).toBe(1);
    expect(t.stderr.join("")).toContain("REDIS_URL");
    expect(t.deps.connect).not.toHaveBeenCalled();
  });
});

describe("checkServices", () => {
  it("reports a dependency that does not answer in time", async () => {
    const services = fakeServices();
    services.db.$queryRaw = vi.fn(() => new Promise<string>(() => undefined));
    expect(await checkServices(services as unknown as Services, 20)).toEqual([
      { service: "database", reason: "no answer within 20 ms" },
    ]);
  });

  it("falls back to the error name when the message is empty", async () => {
    const services = fakeServices({ database: new TypeError("") });
    expect(await checkServices(services as unknown as Services)).toEqual([
      { service: "database", reason: "TypeError" },
    ]);
  });
});
