import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, bearerKey, generateApiKey, hashApiKey } from "./api-key";
import { hashPassword, PasswordSchema, verifyPassword } from "./password";

describe("API keys", () => {
  it("are 256 random bits behind the drift_ prefix, stored only as a SHA-256", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^drift_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, API_KEY_PREFIX.length + 8));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toBe(b.hash);
  });

  it("are read from a Bearer header only when they are DRIFT keys", () => {
    const { key } = generateApiKey();
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`bearer   ${key}`)).toBe(key);
    expect(bearerKey("Bearer eyJhbGciOiJIUzI1NiJ9.e30.x")).toBeUndefined(); // a session token is not accepted here
    expect(bearerKey(`Basic ${key}`)).toBeUndefined();
    expect(bearerKey(null)).toBeUndefined();
  });
});

describe("passwords", () => {
  it("are hashed with bcrypt and verified", async () => {
    const hash = await hashPassword("correct horse battery", 4);
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("fail without a stored hash, after doing the same work", async () => {
    expect(await verifyPassword("anything at all", null)).toBe(false);
    expect(await verifyPassword("anything at all", undefined)).toBe(false);
  }, 20_000);

  it("must be at least 10 characters and at most bcrypt's 72 bytes", () => {
    expect(PasswordSchema.safeParse("short").success).toBe(false);
    expect(PasswordSchema.safeParse("long enough!").success).toBe(true);
    expect(PasswordSchema.safeParse("x".repeat(73)).success).toBe(false);
    expect(PasswordSchema.safeParse("é".repeat(37)).success).toBe(false); // 74 bytes
  });
});
