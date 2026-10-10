import bcrypt from "bcryptjs";
import { z } from "zod";

/** bcrypt work factor (PLAN: at least 12). */
export const BCRYPT_COST = 12;

/**
 * bcrypt only reads the first 72 bytes of a password, so longer ones are refused instead of silently truncated.
 * The minimum is a length rule only: length is what makes a password hard to guess.
 */
export const PasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Use at most 72 bytes");

export function hashPassword(password: string, cost = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

/**
 * Checks a password. Without a stored hash (an unknown email, or a GitHub-only account) it still runs one bcrypt
 * comparison, so the response time does not reveal whether the account exists.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, await dummyHash());
    return false;
  }
  return bcrypt.compare(password, hash);
}

// A bcrypt hash (same cost) of a random value nobody knows, made on first use.
let dummy: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummy ??= bcrypt.hash(bcrypt.genSaltSync(4), BCRYPT_COST);
  return dummy;
}
