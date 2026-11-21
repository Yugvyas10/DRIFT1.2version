import { randomBytes } from "node:crypto";

/** Prefixes of application-generated ids, one per model. */
export const ID_PREFIXES = {
  user: "usr",
  account: "acc",
  organization: "org",
  membership: "mem",
  invitation: "inv",
  project: "prj",
  apiKey: "key",
  run: "run",
  stage: "stg",
  artifact: "art",
  change: "chg",
  evidence: "evd",
  policy: "pol",
  suppression: "sup",
  audit: "aud",
  webhook: "whd",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

/**
 * A new id such as `run_0k3v9x…`: the model's prefix and 24 base-36 characters from 120 random bits
 * (`crypto.randomBytes`). Unguessable, URL-safe, and recognisable in logs.
 */
export function newId(kind: IdKind): string {
  const random = BigInt(`0x${randomBytes(15).toString("hex")}`)
    .toString(36)
    .padStart(24, "0");
  return `${ID_PREFIXES[kind]}_${random}`;
}
