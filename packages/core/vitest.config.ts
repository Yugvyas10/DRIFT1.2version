import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests compile the official OpenAPI schemas and run whole comparisons; 5 s is too tight when turbo runs
    // every package's tests at once on a busy machine (seen locally, M3).
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/testing/**"],
      reporter: ["text", "json-summary"],
      // packages/core and packages/rules must stay at or above 90% (CLAUDE.md).
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
