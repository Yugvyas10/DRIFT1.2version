import { describe, expect, it } from "vitest";
import { createLogger, describeError } from "./logger.ts";

function capture(level = "info") {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "test",
    level,
    destination: { write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>) },
  });
  return { logger, lines };
}

describe("createLogger", () => {
  it("writes JSON lines with the service, the level as a word, and the ids a child adds", () => {
    const { logger, lines } = capture();
    logger.child({ requestId: "req_1", runId: "run_1" }).info({ stage: "verify", durationMs: 12 }, "stage finished");
    expect(lines[0]).toMatchObject({
      level: "info",
      service: "test",
      requestId: "req_1",
      runId: "run_1",
      stage: "verify",
      durationMs: 12,
      msg: "stage finished",
    });
    logger.debug("hidden at this level");
    expect(lines).toHaveLength(1);
    // The default level is info, and the default destination is stdout.
    expect(createLogger({ service: "test" }).level).toBe("info");
    expect(capture("debug").logger.isLevelEnabled("debug")).toBe(true);
  });

  it("replaces secret-looking fields, at the top level and one level down", () => {
    const { logger, lines } = capture();
    const secret = ["drift", "x".repeat(43)].join("_");
    logger.info(
      {
        authorization: `Bearer ${secret}`,
        password: "correct horse battery",
        headers: { cookie: "next-auth.session-token=abc", "set-cookie": "x=1", accept: "application/json" },
        s3: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "shh" },
        apiKey: secret,
        orgId: "org_1",
      },
      "request"
    );
    const text = JSON.stringify(lines[0]);
    for (const leaked of [secret, "correct horse", "session-token", "AKIAEXAMPLE", "shh", "x=1"])
      expect(text).not.toContain(leaked);
    expect(lines[0]).toMatchObject({
      authorization: "[REDACTED]",
      password: "[REDACTED]",
      orgId: "org_1",
      headers: { cookie: "[REDACTED]", accept: "application/json" },
    });
  });

  it("logs errors as name, message and code only", () => {
    const { logger, lines } = capture();
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), {
      code: "ECONNREFUSED",
      config: { password: "hunter2" },
    });
    logger.error({ err: error }, "redis unreachable");
    expect(lines[0]?.err).toEqual({
      name: "Error",
      message: "connect ECONNREFUSED 127.0.0.1:6379",
      code: "ECONNREFUSED",
    });
    expect(JSON.stringify(lines[0])).not.toContain("hunter2");
    expect(describeError("plain")).toEqual({ name: "NonError", message: "plain" });
    expect(
      describeError({ message: "Connection is closed.", code: "ECONNREFUSED", args: ["AUTH", "hunter2"] })
    ).toEqual({
      name: "NonError",
      message: "Connection is closed.",
      code: "ECONNREFUSED",
    });
    expect(describeError({ name: "ReplyError", code: "NOAUTH" })).toEqual({
      name: "ReplyError",
      message: "NOAUTH",
      code: "NOAUTH",
    });
    expect(describeError({ command: { args: ["hunter2"] } })).toEqual({
      name: "NonError",
      message: "an object that is not an Error",
    });
  });
});
