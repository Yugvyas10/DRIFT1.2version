import { describe, expect, it } from "vitest";
import { EnvValidationError, parseWorkerEnv } from "./env.ts";

const VALID = {
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://drift:pw@localhost:5432/drift",
  S3_ENDPOINT: "http://localhost:8333",
  S3_BUCKET: "drift-artifacts",
  S3_ACCESS_KEY_ID: "drift",
  S3_SECRET_ACCESS_KEY: "local-only",
};

describe("parseWorkerEnv", () => {
  it("accepts the required variables and fills in the defaults", () => {
    expect(parseWorkerEnv(VALID)).toEqual({
      ...VALID,
      S3_REGION: "us-east-1",
      LOG_LEVEL: "info",
      WORKER_CONCURRENCY: 2,
      ORG_CONCURRENCY: 2,
      RUN_TIMEOUT_MS: 600_000,
    });
  });

  it("accepts TLS Redis, a log level, a tracing endpoint and limits", () => {
    const env = parseWorkerEnv({
      ...VALID,
      REDIS_URL: "rediss://cache.internal:6380",
      LOG_LEVEL: "debug",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      WORKER_CONCURRENCY: "4",
      ORG_CONCURRENCY: "1",
      RUN_TIMEOUT_MS: "30000",
    });
    expect(env).toMatchObject({
      LOG_LEVEL: "debug",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      WORKER_CONCURRENCY: 4,
      ORG_CONCURRENCY: 1,
      RUN_TIMEOUT_MS: 30_000,
    });
  });

  it("treats an empty value as unset", () => {
    expect(parseWorkerEnv({ ...VALID, OTEL_EXPORTER_OTLP_ENDPOINT: "", LOG_LEVEL: "" })).toMatchObject({
      LOG_LEVEL: "info",
    });
    expect(parseWorkerEnv({ ...VALID, OTEL_EXPORTER_OTLP_ENDPOINT: "" })).not.toHaveProperty(
      "OTEL_EXPORTER_OTLP_ENDPOINT"
    );
  });

  it("names every missing or invalid variable in one readable error, without values", () => {
    let caught: unknown;
    try {
      parseWorkerEnv({ LOG_LEVEL: "verbose", WORKER_CONCURRENCY: "0", S3_SECRET_ACCESS_KEY: "do-not-echo" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const message = (caught as Error).message;
    expect(message).toContain("Invalid worker environment");
    for (const name of ["REDIS_URL", "DATABASE_URL", "S3_ENDPOINT", "S3_BUCKET", "LOG_LEVEL", "WORKER_CONCURRENCY"]) {
      expect(message).toContain(name);
    }
    expect(message).not.toContain("do-not-echo");
  });

  it("rejects URLs of the wrong kind", () => {
    expect(() => parseWorkerEnv({ ...VALID, REDIS_URL: "http://localhost:6379" })).toThrow(EnvValidationError);
    expect(() => parseWorkerEnv({ ...VALID, REDIS_URL: "not a url" })).toThrow(EnvValidationError);
    expect(() => parseWorkerEnv({ ...VALID, DATABASE_URL: "mysql://localhost/drift" })).toThrow(EnvValidationError);
    expect(() => parseWorkerEnv({ ...VALID, S3_ENDPOINT: "ftp://localhost" })).toThrow(EnvValidationError);
  });
});
