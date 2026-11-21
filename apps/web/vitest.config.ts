import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // *.int.test.ts need Postgres and S3: `pnpm --filter @drift/web run test:integration`.
    exclude: ["src/**/*.int.test.ts"],
    coverage: {
      provider: "v8",
      // The unit run covers the parts that need no database: env validation, HTTP helpers, permissions, keys,
      // passwords and the route table. Services and handlers are covered by the integration run (real Postgres
      // and S3, its own 80% threshold), and pages by `next build` and the Playwright tests.
      include: [
        "src/lib/**/*.ts",
        "src/server/http.ts",
        "src/server/auth/permissions.ts",
        "src/server/auth/api-key.ts",
        "src/server/auth/password.ts",
        "src/server/auth/actor.ts",
        "src/server/auth/session.ts",
      ],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
