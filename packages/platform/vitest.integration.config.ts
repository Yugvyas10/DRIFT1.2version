import { defineConfig } from "vitest/config";

/** `pnpm --filter @drift/platform run test:integration`: against real Redis and S3 in containers (needs Docker). */
export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    coverage: {
      provider: "v8",
      include: ["src/events.ts", "src/queue.ts", "src/redis.ts", "src/semaphore.ts", "src/storage.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage-integration",
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
