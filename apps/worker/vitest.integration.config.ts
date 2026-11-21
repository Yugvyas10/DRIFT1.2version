import { defineConfig } from "vitest/config";

/** `pnpm --filter @drift/worker run test:integration`: against real Postgres, Redis and S3 in containers (needs Docker). */
export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // The files share one Redis, and so one run queue: one file at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
    coverage: {
      provider: "v8",
      include: ["src/engine-task.ts", "src/processor.ts", "src/queue-worker.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage-integration",
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
