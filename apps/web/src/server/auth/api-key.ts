import { createHash, randomBytes } from "node:crypto";

/** Every key starts with this, so secret scanners (and people) can recognise one (SECURITY T13). */
export const API_KEY_PREFIX = "drift_";
const DISPLAY_LENGTH = API_KEY_PREFIX.length + 8;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * A new API key: `drift_` and 32 random bytes (256 bits) in base64url. Only its SHA-256 and its first characters
 * are stored. The key is unguessable, so a fast hash is enough (unlike a password, there is nothing to brute-force).
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, DISPLAY_LENGTH), hash: hashApiKey(key) };
}

/** The key in an `Authorization: Bearer drift_…` header, or undefined. */
export function bearerKey(header: string | null): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  const key = match?.[1];
  return key?.startsWith(API_KEY_PREFIX) ? key : undefined;
}
