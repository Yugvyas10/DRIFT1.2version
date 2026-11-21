import { z } from "zod";
import { Policy } from "./policy.ts";
import { Ruleset } from "./ruleset.ts";

/** The published JSON Schemas for rules and policy files, generated from the zod types (committed under `schemas/`). */
export function jsonSchemas(): Record<string, unknown> {
  return {
    "drift-rules-v1.schema.json": z.toJSONSchema(Ruleset, { target: "draft-2020-12", io: "input" }),
    "drift-policy-v1.schema.json": z.toJSONSchema(Policy, { target: "draft-2020-12", io: "input" }),
  };
}
