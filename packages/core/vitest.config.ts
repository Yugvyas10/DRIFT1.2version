import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
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
