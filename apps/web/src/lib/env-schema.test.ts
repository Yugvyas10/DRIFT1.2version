import { describe, expect, it } from "vitest";
import { EnvValidationError, parseWebEnv } from "./env-schema";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://drift:local@localhost:5432/drift",
  AUTH_SECRET: "x".repeat(32),
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:8333",
  S3_BUCKET: "drift-artifacts",
  S3_ACCESS_KEY_ID: "drift",
  S3_SECRET_ACCESS_KEY: "local-only",
};

function failure(source: Record<string, string | undefined>): string {
  try {
    parseWebEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as Error).message;
  }
  throw new Error("expected the environment to be rejected");
}

describe("parseWebEnv", () => {
  it("accepts a valid environment and applies the defaults", () => {
    expect(parseWebEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: "development",
      S3_REGION: "us-east-1",
      LOG_LEVEL: "info",
    });
  });

  it("keeps an explicit NODE_ENV", () => {
    expect(parseWebEnv({ ...valid, NODE_ENV: "production" }).NODE_ENV).toBe("production");
  });

  it("explains every missing variable in one readable message", () => {
    const message = failure({});
    expect(message).toContain("Invalid web environment");
    for (const name of ["APP_URL", "DATABASE_URL", "AUTH_SECRET", "REDIS_URL", "S3_ENDPOINT", "S3_BUCKET"]) {
      expect(message).toContain(name);
    }
  });

  it.each(["localhost:3000", "ftp://drift.example", "not a url"])("rejects APP_URL=%s", (value) => {
    expect(() => parseWebEnv({ ...valid, APP_URL: value })).toThrow(EnvValidationError);
  });

  it("rejects a database URL that is not PostgreSQL, and a short secret, without echoing the values", () => {
    const message = failure({ ...valid, DATABASE_URL: "mysql://root:hunter2@db/drift", AUTH_SECRET: "too-short" });
    expect(message).toContain("DATABASE_URL must be a postgresql:// URL");
    expect(message).toContain("AUTH_SECRET must be at least 32 characters");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("too-short");
  });

  it("checks the Redis URL and the optional tracing endpoint", () => {
    expect(failure({ ...valid, REDIS_URL: "http://localhost:6379" })).toContain(
      "REDIS_URL must be a redis:// or rediss:// URL"
    );
    expect(
      parseWebEnv({ ...valid, OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" }).OTEL_EXPORTER_OTLP_ENDPOINT
    ).toBe("http://localhost:4318");
    expect(failure({ ...valid, OTEL_EXPORTER_OTLP_ENDPOINT: "jaeger:4318" })).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("takes GitHub OAuth credentials only as a pair, and treats empty values as unset", () => {
    expect(parseWebEnv({ ...valid, GITHUB_ID: "id", GITHUB_SECRET: "secret" }).GITHUB_ID).toBe("id");
    expect(parseWebEnv({ ...valid, GITHUB_ID: "", GITHUB_SECRET: "" }).GITHUB_ID).toBeUndefined();
    expect(failure({ ...valid, GITHUB_ID: "id" })).toContain("GITHUB_ID and GITHUB_SECRET must be set together");
  });
});
