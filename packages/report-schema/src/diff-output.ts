import { z } from "zod";
import { Change } from "./change.ts";

export const DIFF_OUTPUT_ID = "drift-diff/v1";

/** Summary of one ingested contract. */
export const SpecSummary = z.object({
  file: z.string(),
  oasVersion: z.string(),
  title: z.string(),
  version: z.string(),
  /** Content hash of the normalised contract (ADR-0006). */
  specHash: z.string().regex(/^[0-9a-f]{64}$/),
  operations: z.number().int().nonnegative(),
});
export type SpecSummary = z.infer<typeof SpecSummary>;

/** Output of `drift diff`: the structural changes and the impact index (operation → change ids). */
export const DiffOutput = z.object({
  format: z.literal(DIFF_OUTPUT_ID),
  engine: z.object({ name: z.string(), version: z.string() }),
  base: SpecSummary,
  head: SpecSummary,
  changes: z.array(Change),
  impact: z.record(z.string(), z.array(z.string())),
});
export type DiffOutput = z.infer<typeof DiffOutput>;
