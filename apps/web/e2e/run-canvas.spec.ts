import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_URL } from "../playwright.config";
import { consoleErrors, drift, newAccountWithKey, noAccessibilityViolations } from "./helpers";

const unique = `${Date.now().toString(36)}c`;
const names = {
  email: `e2e-${unique}@example.com`,
  password: `e2e-only-${unique}-password`,
  org: `e2e-canvas-${unique}`,
  project: "petstore",
};
const traffic = fileURLToPath(new URL("../../../examples/petstore/traffic.jsonl", import.meta.url));
const inThirtyDays = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test("canvas → re-run Corpus with a traffic file → diff → change → suppress → policy → re-run Classify", async ({
  page,
}) => {
  const errors = consoleErrors(page);
  const key = await newAccountWithKey(page, names);
  const runPage = (id: string) => new RegExp(`/dashboard/${names.org}/${names.project}/runs/${id}$`);

  // A server-side run without traffic: synthetic samples only.
  const run = await drift(
    [
      "run",
      "--base",
      "examples/petstore/v1.yaml",
      "--head",
      "examples/petstore/v2-breaking.yaml",
      "--project",
      names.project,
      "--api-url",
      E2E_URL,
      "--commit",
      "c".repeat(40),
    ],
    { DRIFT_API_KEY: key }
  );
  expect(run.stderr).toBe("");
  expect(run.code).toBe(1);
  const runId = /^run (run_[0-9a-z]+) {2}queued$/m.exec(run.stdout)?.[1] ?? "";

  // The canvas: six stage tabs, Report & Gate selected, arrow keys move between them.
  await page.goto(`/dashboard/${names.org}/${names.project}`);
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  await page.getByTestId("run").getByRole("link").click();
  await expect(page).toHaveURL(runPage(runId));
  await expect(page.locator('[data-testid="canvas-stage"][data-status="succeeded"]')).toHaveCount(6);
  await expect(page.getByRole("tab", { selected: true })).toContainText("Report & Gate");
  await page.getByRole("tab", { selected: true }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Ingest");
  await expect(page.getByRole("tab", { selected: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { selected: true })).toContainText("Corpus");
  await expect(page.getByTestId("change").filter({ hasText: "(recorded)" })).toHaveCount(0);
  await noAccessibilityViolations(page);

  // Re-run from Corpus with a traffic file uploaded from the browser: Ingest and Diff come from the cache.
  const corpus = page.getByRole("tabpanel");
  await corpus.getByLabel(/^Traffic/).setInputFiles(traffic);
  await corpus.getByRole("button", { name: "Re-run with these inputs" }).click();
  await expect(page).not.toHaveURL(runPage(runId));
  await expect(page.getByText(`re-run of ${runId}`)).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("complete", { timeout: 30_000 });
  const childId = /runs\/(run_[0-9a-z]+)$/.exec(page.url())?.[1] ?? "";
  const stage = (id: string) => page.locator(`[data-testid="canvas-stage"][data-stage="${id}"]`);
  await expect(stage("ingest")).toHaveAttribute("data-cached", "true");
  await expect(stage("diff")).toHaveAttribute("data-cached", "true");
  await expect(stage("corpus")).toHaveAttribute("data-cached", "false");
  // The uploaded traffic is now evidence.
  await expect(page.getByTestId("change").filter({ hasText: "(recorded)" })).not.toHaveCount(0);

  // The label filter of the change list.
  await page
    .getByRole("navigation", { name: "Filter changes by label" })
    .getByRole("link", { name: /^breaking/ })
    .click();
  await expect(page.getByTestId("change")).not.toHaveCount(0);
  await expect(page.getByTestId("change").filter({ hasNotText: "BREAKING" })).toHaveCount(0);
  await noAccessibilityViolations(page);

  // The side-by-side diff, from the Diff inspector.
  await page.getByRole("tab", { name: /Diff/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "Contract diff, side by side" }).click();
  await expect(page.getByTestId("diff-change")).not.toHaveCount(0);
  await expect(page.getByTestId("snippet-base").first()).toBeVisible();
  await expect(page.getByTestId("snippet-head").first()).toBeVisible();
  await noAccessibilityViolations(page);
  // At phone width the snippets scroll inside their boxes; the page itself does not scroll sideways.
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  if (desktop) await page.setViewportSize(desktop);

  // One breaking change: its rule, evidence and a recorded failing sample; then suppress it.
  await page.goto(`/dashboard/${names.org}/${names.project}/runs/${childId}?label=breaking`);
  await page.getByTestId("change").filter({ hasText: "(recorded)" }).first().getByRole("link").click();
  await expect(page.getByTestId("change-label")).toHaveText("BREAKING");
  await expect(page.getByTestId("evidence-summary")).toContainText("recorded");
  await expect(page.getByTestId("example").filter({ hasText: "Failing sample: recorded" })).not.toHaveCount(0);
  await noAccessibilityViolations(page);
  await page.getByLabel("Reason (at least 10 characters)").fill("End-to-end: clients already migrated.");
  await page.getByLabel("Until").fill(inThirtyDays);
  await page.getByRole("button", { name: "Suppress" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Suppressed until ${inThirtyDays}` })).toBeVisible();

  // Project settings: the suppression, a refused and then a saved policy, and the workflow wizard.
  await page.goto(`/dashboard/${names.org}/${names.project}`);
  await page.getByRole("link", { name: /^Project settings/ }).click();
  await expect(page.getByTestId("suppression")).toHaveCount(1);
  const policy = page.getByLabel("Policy (YAML or JSON)");
  await policy.fill("format: drift-policy/v2\n");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "policy.format" })).toBeVisible();
  await expect(page.getByTestId("policy-hash")).toHaveCount(0);
  await policy.fill("format: drift-policy/v1\nfailOn: risky\n");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByTestId("policy-hash")).toBeVisible();
  await page.getByLabel("Fail the check on").selectOption("risky");
  await page.getByLabel("Upload each run to this project").check();
  await expect(page.getByTestId("workflow-yaml")).toContainText("fail-on: risky");
  await expect(page.getByTestId("workflow-yaml")).toContainText("secrets.DRIFT_API_KEY");
  await noAccessibilityViolations(page);

  // Re-run Classify: the project policy and the suppression apply, and only Classify runs again.
  await page.goto(`/dashboard/${names.org}/${names.project}/runs/${childId}?stage=classify`);
  await page.getByRole("tabpanel").getByRole("button", { name: "Re-run with these inputs" }).click();
  await expect(page.getByText(`re-run of ${childId}`)).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("complete", { timeout: 30_000 });
  await expect(page.getByTestId("gate")).toContainText("fails on risky");
  await expect(page.getByTestId("gate")).toContainText("1 suppressed");
  await expect(page.locator('[data-testid="canvas-stage"][data-cached="true"]')).toHaveCount(4);

  // The run list filters.
  await page.goto(`/dashboard/${names.org}/${names.project}`);
  await expect(page.getByTestId("run")).toHaveCount(3);
  await page.getByLabel("Status").selectOption("failed");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/status=failed/);
  await expect(page.getByText("No runs match these filters.")).toBeVisible();
  await page.getByLabel("Status").selectOption("complete");
  await page.getByLabel("Mode").selectOption("server");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByTestId("run")).toHaveCount(3);
  await expect(page.getByTestId("run").filter({ hasText: "re-run" })).toHaveCount(2);

  expect(errors).toEqual([]);
});

test("a run's files need a session; the public pages need none", async ({ page }) => {
  await page.goto("/dashboard/some-org/some-project/runs/run_x/artifacts/report-json");
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  for (const [path, heading] of [
    ["/", /breaking api changes/i],
    ["/docs", /using drift/i],
    ["/about", /about/i],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await noAccessibilityViolations(page);
  }
});
