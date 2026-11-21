import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/fetch-fixtures.ts", "src/check-fixtures.ts"],
      reporter: ["text", "json-summary"],
      // packages/core and packages/rules must stay at or above 90%; every other package at or above 80% (CLAUDE.md).
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
