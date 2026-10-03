import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const repo = fileURLToPath(new URL("../../../", import.meta.url));

/** Runs the real, built `drift` binary. */
export async function drift(args: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", ["packages/cli/dist/bin.js", ...args], {
      cwd: repo,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

export async function noAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

/** Collects the page's console errors; the tests expect none. */
export function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Registers an account (which signs in), then creates an organisation, a project and an API key through the UI. */
export async function newAccountWithKey(
  page: Page,
  names: { email: string; password: string; org: string; project: string }
): Promise<string> {
  await page.goto("/register");
  await page.getByLabel("Name").fill("End To End");
  await page.getByLabel("Email").fill(names.email);
  await page.getByLabel("Password").fill(names.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const newOrg = page.getByRole("region", { name: "Create an organisation" });
  await newOrg.getByLabel("Name").fill("End-to-end");
  await newOrg.getByLabel("Slug").fill(names.org);
  await newOrg.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${names.org}$`));

  const newProject = page.getByRole("region", { name: "Create a project" });
  await newProject.getByLabel("Name").fill("Petstore");
  await newProject.getByLabel("Slug").fill(names.project);
  await newProject.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("link", { name: "Petstore" })).toBeVisible();

  await page.goto(`/settings/${names.org}/keys`);
  const newKey = page.getByRole("region", { name: "Create a key" });
  await newKey.getByLabel("Name").fill("End-to-end CLI");
  await newKey.getByRole("button", { name: "Create key" }).click();
  return (await page.getByTestId("secret").textContent()) ?? "";
}
