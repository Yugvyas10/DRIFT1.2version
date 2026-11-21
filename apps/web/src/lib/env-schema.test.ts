import { describe, expect, it } from "vitest";
import { EnvValidationError, parseWebEnv } from "./env-schema";

describe("parseWebEnv", () => {
  it("accepts a valid environment and defaults NODE_ENV", () => {
    expect(parseWebEnv({ APP_URL: "http://localhost:3000" })).toEqual({
      APP_URL: "http://localhost:3000",
      NODE_ENV: "development",
    });
  });

  it("keeps an explicit NODE_ENV", () => {
    expect(parseWebEnv({ APP_URL: "https://drift.example", NODE_ENV: "production" }).NODE_ENV).toBe("production");
  });

  it("explains a missing APP_URL in a readable message", () => {
    let caught: unknown;
    try {
      parseWebEnv({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as Error).message).toContain("Invalid web environment");
    expect((caught as Error).message).toContain("APP_URL");
  });

  it.each(["localhost:3000", "ftp://drift.example", "not a url"])("rejects APP_URL=%s", (value) => {
    expect(() => parseWebEnv({ APP_URL: value })).toThrow(EnvValidationError);
  });
});
