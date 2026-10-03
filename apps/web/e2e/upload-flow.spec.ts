import { expect, test } from "@playwright/test";
import { E2E_URL } from "../playwright.config";
import { drift, noAccessibilityViolations } from "./helpers";

const unique = Date.now().toString(36);
const account = { email: `e2e-${unique}@example.com`, password: `e2e-only-${unique}-password` };
const org = `e2e-org-${unique}`;
const project = "petstore";

const compare = [
  "compare",
  "--base",
  "examples/petstore/v1.yaml",
  "--head",
  "examples/petstore/v2-breaking.yaml",
  "--traffic",
  "examples/petstore/traffic.jsonl",
  "--no-cache",
];
const upload = [...compare, "--upload", "--project", project, "--api-url", E2E_URL, "--commit", "e".repeat(40)];

test.describe.configure({ mode: "serial" });

test("the dashboard and settings need a session, and pages carry a nonce-based CSP", async ({ page }) => {
  for (const path of ["/dashboard", `/settings/${org}/keys`]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=${encodeURIComponent(path)}`));
  }
  const response = await page.goto("/login");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic';/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-inline");
  await noAccessibilityViolations(page);
});

test("register → organisation → project → API key shown once → drift compare --upload → run in the list", async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  // Register (which signs in).
  await page.goto("/register");
  await page.getByLabel("Name").fill("End To End");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(account.email)).toBeVisible();

  // Create an organisation.
  const newOrg = page.getByRole("region", { name: "Create an organisation" });
  await newOrg.getByLabel("Name").fill("End-to-end");
  await newOrg.getByLabel("Slug").fill(org);
  await newOrg.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${org}$`));

  // Create a project.
  const newProject = page.getByRole("region", { name: "Create a project" });
  await newProject.getByLabel("Name").fill("Petstore");
  await newProject.getByLabel("Slug").fill(project);
  await newProject.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("link", { name: "Petstore" })).toBeVisible();
  await noAccessibilityViolations(page);

  // Create an API key: shown once.
  await page.getByRole("link", { name: "API keys" }).click();
  const newKey = page.getByRole("region", { name: "Create a key" });
  await newKey.getByLabel("Name").fill("End-to-end CLI");
  await newKey.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("Copy this API key now. It is not shown again.")).toBeVisible();
  const key = (await page.getByTestId("secret").textContent()) ?? "";
  expect(key).toMatch(/^drift_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByTestId("key")).toHaveCount(1);
  await noAccessibilityViolations(page);
  await page.reload();
  await expect(page.getByTestId("secret")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);

  // Upload a run with the real CLI. The gate fails (exit 1): the upload is independent of the gate result.
  const first = await drift(upload, { DRIFT_API_KEY: key });
  expect(first.stderr).toBe("");
  expect(first.code).toBe(1);
  const runId = /uploaded {2}run (run_[0-9a-z]+)\n/.exec(first.stdout)?.[1] ?? "";
  expect(runId).not.toBe("");

  // The run is visible through the API…
  const listed = await request.get(`/api/v1/projects/${project}/runs`, { headers: { authorization: `Bearer ${key}` } });
  expect(listed.status()).toBe(200);
  const { runs } = (await listed.json()) as {
    runs: { id: string; status: string; gate: { passed: boolean }; summary: { breaking: number } }[];
  };
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ id: runId, status: "complete", gate: { passed: false } });
  expect(runs[0]?.summary.breaking).toBeGreaterThan(0);
  // …its report can be read back through a signed URL…
  const link = await request.get(`/api/v1/runs/${runId}/artifacts/report-json`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const stored = (await (await fetch(((await link.json()) as { url: string }).url)).json()) as { format: string };
  expect(stored.format).toBe("drift-report/v1");
  // …and in the minimal run list.
  await page.goto(`/dashboard/${org}/${project}`);
  await expect(page.getByTestId("run")).toHaveCount(1);
  await expect(page.getByTestId("run")).toContainText("failed");
  await expect(page.getByTestId("run")).toContainText("eeeeeee");
  await noAccessibilityViolations(page);

  // Uploading the same run again creates no second run (idempotency).
  const again = await drift(upload, { DRIFT_API_KEY: key });
  expect(again.stdout).toContain(`uploaded  run ${runId} (already uploaded: same run)`);
  await page.reload();
  await expect(page.getByTestId("run")).toHaveCount(1);

  // Revoke the key: the next upload is refused with 401, and the audit log has both entries.
  await page.goto(`/settings/${org}/keys`);
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByTestId("key")).toContainText("revoked");
  const refused = await drift(upload, { DRIFT_API_KEY: key });
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain("401 Unauthorized");
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByTestId("audit")).toContainText(["key.revoke", "key.create", "project.create", "org.create"]);

  expect(consoleErrors).toEqual([]);
});

test("drift run → the worker runs it live → the run page → re-run reuses the cache", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/settings/${org}/keys`);
  const newKey = page.getByRole("region", { name: "Create a key" });
  await newKey.getByLabel("Name").fill("End-to-end server runs");
  await newKey.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("secret").textContent()) ?? "";

  // A server-side run with the real CLI: it uploads the inputs, the worker runs the engine, the CLI follows the
  // live events and exits with the gate (1: the petstore change is breaking).
  const run = await drift(
    [
      "run",
      "--base",
      "examples/petstore/v1.yaml",
      "--head",
      "examples/petstore/v2-breaking.yaml",
      "--traffic",
      "examples/petstore/traffic.jsonl",
      "--project",
      project,
      "--api-url",
      E2E_URL,
      "--commit",
      "f".repeat(40),
    ],
    { DRIFT_API_KEY: key }
  );
  expect(run.stderr).toBe("");
  expect(run.code).toBe(1);
  const runId = /^run (run_[0-9a-z]+) {2}queued$/m.exec(run.stdout)?.[1] ?? "";
  expect(runId).not.toBe("");
  expect(run.stdout).toMatch(/^started {3}attempt 1$/m);
  expect(run.stdout.match(/^ {2}\S+ +(computed|cached) +\d+ ms$/gm)).toHaveLength(6);
  expect(run.stdout).toMatch(/^gate FAILED \(fail-on breaking\): [1-9]\d* breaking/m);

  // The run page shows the finished run and its six stages.
  await page.goto(`/dashboard/${org}/${project}`);
  await page.getByTestId("run").filter({ hasText: "fffffff" }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
  await expect(page.getByTestId("run-status")).toHaveText("complete");
  await expect(page.getByTestId("gate")).toContainText("failed");
  await expect(page.locator('[data-testid="canvas-stage"][data-status="succeeded"]')).toHaveCount(6);
  await noAccessibilityViolations(page);

  // Re-run from the page: a child run, followed live in the browser, with every stage from the cache.
  // The Report & Gate stage is selected for a finished run; its form re-runs from the start.
  await page.getByRole("tabpanel").getByRole("button", { name: "Re-run", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`/runs/${runId}$`));
  await expect(page.getByText(`re-run of ${runId}`)).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("complete", { timeout: 30_000 });
  await expect(page.locator('[data-testid="canvas-stage"][data-status="succeeded"]')).toHaveCount(6);
  await expect(page.locator('[data-testid="canvas-stage"][data-cached="true"]')).toHaveCount(5);
  await noAccessibilityViolations(page);
  expect(consoleErrors).toEqual([]);
});

test("signing out everywhere ends the session, and a wrong password does not sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("definitely not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next.js keeps its own (empty) role="alert" route announcer on every page, so match the message itself.
  await expect(
    page.getByRole("alert").filter({ hasText: "That email address and password do not match an account." })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const cookies = await page.context().cookies();

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page).toHaveURL(/\/login/);
  // The old session cookie is still a validly signed token, but the database no longer accepts it.
  await page.context().addCookies(cookies);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get("/api/v1/orgs");
  expect(api.status()).toBe(401);
});
