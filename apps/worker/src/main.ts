import { createDb } from "@drift/db";
import { createLogger, createRedis, createS3Store, startTracing } from "@drift/platform";
import { createRunWorker } from "./queue-worker.ts";
import { runWorker } from "./worker.ts";

process.exitCode = await runWorker(process.argv.slice(2), process.env, {
  createLogger: (level) => createLogger({ service: "drift-worker", level }),
  connect: (env, s3) => {
    const redis = createRedis(env.REDIS_URL);
    // Without a listener ioredis prints every reconnect error; the probes and the queue report failures instead.
    redis.on("error", () => undefined);
    return { db: createDb(env.DATABASE_URL), redis, store: createS3Store(s3) };
  },
  startTracing: (endpoint) => startTracing({ service: "drift-worker", endpoint }),
  startRunWorker: createRunWorker,
  stopSignal: () =>
    new Promise((resolve) => {
      for (const signal of ["SIGTERM", "SIGINT"] as const)
        process.once(signal, () => {
          resolve(signal);
        });
    }),
  writeStderr: (text) => process.stderr.write(text),
});
