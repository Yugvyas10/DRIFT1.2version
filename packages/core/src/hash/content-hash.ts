import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.ts";

/** Lowercase hex SHA-256 of a string (hashed as UTF-8) or of raw bytes. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Content hash of a JSON value: SHA-256 over its RFC 8785 canonical form.
 * Equal JSON data always has an equal hash, whatever order its keys were built in.
 * This is the building block for spec hashes and stage cache keys (ADR-0006).
 */
export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
