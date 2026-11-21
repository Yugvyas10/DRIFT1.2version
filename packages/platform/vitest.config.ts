import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // *.int.test.ts need Redis and S3: `pnpm --filter @drift/platform run test:integration`.
    exclude: ["src/**/*.int.test.ts"],
    coverage: {
      provider: "v8",
      // The unit run covers what needs no service. Redis- and S3-backed code is covered by the integration run.
      include: ["src/logger.ts", "src/telemetry.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
