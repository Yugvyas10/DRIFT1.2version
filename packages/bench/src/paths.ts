import { fileURLToPath } from "node:url";

/** Repository locations used by the bench scripts. */
export const PATHS = {
  examples: fileURLToPath(new URL("../../../examples/", import.meta.url)),
  fixtures: fileURLToPath(new URL("../fixtures/.cache/", import.meta.url)),
  results: fileURLToPath(new URL("../results/", import.meta.url)),
  evaluation: fileURLToPath(new URL("../../../docs/evaluation/", import.meta.url)),
  page: fileURLToPath(new URL("../../../docs/EVALUATION.md", import.meta.url)),
};
