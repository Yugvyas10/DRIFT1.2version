import { Redis } from "ioredis";
import { pino } from "pino";
import { runWorker } from "./worker.ts";

process.exitCode = await runWorker(process.env, {
  createRedis: (redisUrl) => {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    // ioredis emits the real cause (e.g. ECONNREFUSED) as an "error" event and rejects connect()
    // with a generic "Connection is closed." Keep the cause so runWorker can log it; the listener
    // also stops ioredis printing an "unhandled error event" to stderr.
    let lastError: unknown;
    client.on("error", (error: unknown) => {
      lastError = error;
    });
    return {
      ping: async () => {
        try {
          await client.connect();
        } catch (error) {
          throw lastError ?? error;
        }
        return client.ping();
      },
      disconnect: () => {
        client.disconnect();
      },
    };
  },
  createLogger: (level) => pino({ level, base: { service: "drift-worker" } }),
  writeStderr: (text) => process.stderr.write(text),
});
