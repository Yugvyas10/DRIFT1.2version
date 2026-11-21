import { defineConfig, devices } from "@playwright/test";

export const E2E_PORT = 3100;
export const E2E_URL = `http://localhost:${String(E2E_PORT)}`;

/**
 * `pnpm --filter @drift/web run test:e2e` (after `pnpm turbo run build --filter=@drift/web --filter=@drift/cli`).
 * The global setup starts Postgres and S3 in containers, applies the migrations, and runs the built app
 * (`next start`) against them; the tests drive a real browser and the real `drift` binary (needs Docker).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
