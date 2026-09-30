import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_LIMITS, parseDataText, REPORT_FORMATS } from "@drift/core";
import { FailOn } from "@drift/report-schema";
import { z } from "zod";

export const CONFIG_FORMAT = "drift-config/v1";
export const CONFIG_FILES = ["drift.config.json", "drift.config.yaml", "drift.config.yml"] as const;

/**
 * `drift.config.{json,yaml}`: defaults for `drift compare`, so a CI job can run a bare `drift compare`.
 * Paths are relative to the config file. Command-line flags always win.
 */
export const DriftConfig = z
  .strictObject({
    $schema: z.string().optional(),
    format: z.literal(CONFIG_FORMAT),
    base: z.string().optional(),
    head: z.string().optional(),
    traffic: z.string().optional(),
    rules: z.string().optional(),
    policy: z.string().optional(),
    formats: z.array(z.enum(REPORT_FORMATS)).min(1).optional(),
    out: z.string().optional(),
    failOn: FailOn.optional(),
    seed: z.number().int().optional(),
    refRoot: z.string().optional(),
    /** Stage cache directory, or false to turn the cache off. */
    cache: z.union([z.string(), z.literal(false)]).optional(),
  })
  .meta({ id: "drift-config-v1", title: "DRIFT configuration (drift-config/v1)" });
export type DriftConfig = z.infer<typeof DriftConfig>;

export class ConfigError extends Error {}

/** The config file to use: `--config`, else the first of CONFIG_FILES in the working directory, else none. */
export async function loadConfig(
  cwd: string,
  explicit: string | undefined,
  shown: (path: string) => string
): Promise<{ config: DriftConfig; dir: string } | undefined> {
  const path =
    explicit === undefined ? CONFIG_FILES.map((name) => join(cwd, name)).find(existsSync) : resolve(cwd, explicit);
  if (path === undefined) return undefined;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(`drift: cannot read the config file ${shown(path)}`);
  }
  const parsed = parseDataText(text, shown(path), DEFAULT_LIMITS);
  if (!parsed.ok) {
    throw new ConfigError(parsed.diagnostics.map((d) => `${d.file}:${String(d.line ?? 1)}  ${d.message}`).join("\n"));
  }
  const result = DriftConfig.safeParse(parsed.value);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) =>
        `${shown(path)}: ${issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : ""}${issue.message}`
    );
    throw new ConfigError(issues.join("\n"));
  }
  return { config: result.data, dir: dirname(path) };
}

/** Published JSON Schema of the config file (committed under `schemas/`). */
export function configJsonSchema(): unknown {
  return z.toJSONSchema(DriftConfig, { target: "draft-2020-12", io: "input" });
}
