import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests run whole comparisons in temporary git repositories.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts only wires @actions/core and @actions/github to runAction; it runs in the dogfood job.
      exclude: ["src/**/*.test.ts", "src/main.ts"],
      reporter: ["text", "json-summary"],
      // packages/core and packages/rules must stay at or above 90%; every other package at or above 80% (CLAUDE.md).
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
