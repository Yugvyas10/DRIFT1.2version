import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `pnpm --filter @drift/web run test:integration`: the API against real Postgres and S3 (needs Docker).
 * Coverage here is what holds `src/server` to the 80% threshold; the unit run covers the pure parts.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      // Not counted here: context.ts, auth/options.ts and page.ts bind the live environment, next-auth and a Next.js
      // request, and are exercised by the end-to-end tests; auth/session.ts is covered by the unit run.
      exclude: [
        "src/**/*.test.ts",
        "src/server/testing/**",
        "src/server/context.ts",
        "src/server/page.ts",
        "src/server/auth/options.ts",
        "src/server/auth/session.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage-integration",
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
