import type { FailOn } from "@drift/report-schema";

/** The Action's inputs (action.yml), validated. */
export interface ActionInputs {
  /** The contract in the repository: the head is this file, the base the same path at the base commit. */
  spec?: string;
  /** Overrides the base: a file, or `<ref>:<path>`. */
  base?: string;
  /** Overrides the head file. */
  head?: string;
  traffic?: string;
  rules?: string;
  policy?: string;
  config?: string;
  failOn?: FailOn;
  /** Post or update one comment on the pull request. */
  comment: boolean;
  /** Upload the SARIF report to GitHub code scanning. */
  sarif: boolean;
  /** Upload to the DRIFT platform: not built yet (M5). */
  upload: boolean;
  /** What to do when the spec does not exist at the base commit (a new API). */
  baseMissing: "pass" | "fail";
  /** Tells this step's comment apart from other DRIFT steps in the same pull request. */
  commentKey: string;
  workingDirectory: string;
}

export class InputError extends Error {}

function boolean(get: (name: string) => string, name: string, fallback: boolean): boolean {
  const value = get(name).trim();
  if (value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InputError(`drift: input "${name}" must be true or false, not "${value}"`);
}

function choice<T extends string>(get: (name: string) => string, name: string, values: readonly T[]): T | undefined {
  const value = get(name).trim();
  if (value === "") return undefined;
  if (!(values as readonly string[]).includes(value)) {
    throw new InputError(`drift: input "${name}" must be one of ${values.join(", ")}, not "${value}"`);
  }
  return value as T;
}

/**
 * A comment key keeps to characters that cannot end an HTML comment or break the marker. Other characters
 * become "_", and it is at most 200 characters long.
 */
export function commentKey(value: string): string {
  return value.replace(/[^A-Za-z0-9._/-]/g, "_").slice(0, 200);
}

/** Reads and validates the inputs. `get` returns "" for an input that was not given (as @actions/core does). */
export function parseInputs(get: (name: string) => string): ActionInputs {
  const optional = (name: string) => {
    const value = get(name).trim();
    return value === "" ? undefined : value;
  };
  const spec = optional("spec");
  const head = optional("head");
  const inputs: ActionInputs = {
    comment: boolean(get, "comment", true),
    sarif: boolean(get, "sarif", false),
    upload: boolean(get, "upload", false),
    baseMissing: choice(get, "base-missing", ["pass", "fail"] as const) ?? "pass",
    commentKey: commentKey(optional("comment-key") ?? head ?? spec ?? "drift"),
    workingDirectory: optional("working-directory") ?? ".",
  };
  const failOn = choice(get, "fail-on", ["breaking", "risky"] as const);
  if (failOn) inputs.failOn = failOn;
  for (const [key, name] of [
    ["base", "base"],
    ["traffic", "traffic"],
    ["rules", "rules"],
    ["policy", "policy"],
    ["config", "config"],
  ] as const) {
    const value = optional(name);
    if (value !== undefined) inputs[key] = value;
  }
  if (spec !== undefined) inputs.spec = spec;
  if (head !== undefined) inputs.head = head;
  return inputs;
}
