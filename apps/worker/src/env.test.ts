import { describe, expect, it } from "vitest";
import { EnvValidationError, parseWorkerEnv, redisTarget } from "./env.ts";

describe("parseWorkerEnv", () => {
  it("accepts a redis URL and defaults the log level", () => {
    expect(parseWorkerEnv({ REDIS_URL: "redis://localhost:6379" })).toEqual({
      REDIS_URL: "redis://localhost:6379",
      LOG_LEVEL: "info",
    });
  });

  it("accepts TLS redis URLs and an explicit log level", () => {
    const env = parseWorkerEnv({ REDIS_URL: "rediss://cache.internal:6380", LOG_LEVEL: "debug" });
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("names every missing or invalid variable in one readable error", () => {
    let caught: unknown;
    try {
      parseWorkerEnv({ LOG_LEVEL: "verbose" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const message = (caught as Error).message;
    expect(message).toContain("Invalid worker environment");
    expect(message).toContain("REDIS_URL");
    expect(message).toContain("LOG_LEVEL");
  });

  it("rejects URLs that are not redis URLs", () => {
    expect(() => parseWorkerEnv({ REDIS_URL: "http://localhost:6379" })).toThrow(EnvValidationError);
    expect(() => parseWorkerEnv({ REDIS_URL: "not a url" })).toThrow(EnvValidationError);
  });
});

describe("redisTarget", () => {
  it("never includes credentials", () => {
    expect(redisTarget("redis://user:s3cret@cache.internal:6380/0")).toBe("cache.internal:6380");
  });

  it("defaults the port to 6379", () => {
    expect(redisTarget("redis://localhost")).toBe("localhost:6379");
  });
});
