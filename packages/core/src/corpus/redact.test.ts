import { describe, expect, it } from "vitest";
import { DEFAULT_REDACTION, detect, redactSample } from "./redact.ts";
import type { RoutedSample } from "./sample.ts";

// Fake secrets are assembled at run time so that no secret-shaped literal sits in the repository.
const join = (...parts: string[]) => parts.join("");
export const CANARIES = {
  jwt: join("eyJhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiJ4In0", ".", "c2lnbmF0dXJl"),
  bearer: join("Bearer ", "abcdefghijklmnop"),
  aws: join("AKIA", "ABCDEFGHIJKLMNOP"),
  github: join("ghp_", "a".repeat(36)),
  stripe: join("sk_", "live_", "0123456789abcdef"),
  slack: join("xoxb-", "0123456789-abcdef"),
  google: join("AIza", "b".repeat(35)),
  groq: join("gsk_", "c".repeat(30)),
  openai: join("sk-", "proj-", "d".repeat(24)),
  privateKey: join("-----BEGIN RSA ", "PRIVATE KEY-----"),
  email: "alice@example.com",
  card: "4111 1111 1111 1111",
};

describe("detect", () => {
  it.each([
    ["jwt", CANARIES.jwt],
    ["bearer", CANARIES.bearer],
    ["aws-key", CANARIES.aws],
    ["github-token", CANARIES.github],
    ["stripe-key", CANARIES.stripe],
    ["slack-token", CANARIES.slack],
    ["google-key", CANARIES.google],
    ["groq-key", CANARIES.groq],
    ["api-key", CANARIES.openai],
    ["private-key", CANARIES.privateKey],
    ["email", `contact ${CANARIES.email} today`],
    ["card", `card ${CANARIES.card}`],
    ["card", "4111-1111-1111-1111"],
  ])("finds a %s", (kind, text) => {
    expect(detect(text)).toBe(kind);
  });

  it.each(["hello", "1234 5678 9012 3456", "order 12345", "user@localhost", ""])("leaves %j alone", (text) => {
    expect(detect(text)).toBeUndefined();
  });

  it("stays fast on long adversarial input (bounded patterns)", () => {
    const started = performance.now();
    detect("a".repeat(200_000));
    detect(`${"a.".repeat(100_000)}@`);
    detect("eyJ".repeat(50_000));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

function sample(overrides: Partial<RoutedSample> = {}): RoutedSample {
  return {
    id: "r:1",
    origin: "recorded",
    line: 1,
    method: "POST",
    path: "/users/alice%40example.com/pets",
    query: {},
    headers: {},
    redacted: [],
    operation: "POST /users/{}/pets",
    pathParams: [CANARIES.email],
    ...overrides,
  };
}

describe("redactSample", () => {
  it("redacts denylisted headers, query fields and body fields, and every detected value", () => {
    const out = redactSample(
      sample({
        query: { token: ["t1", "t2"], q: [CANARIES.email], page: ["2"] },
        headers: { authorization: [CANARIES.bearer], "x-trace": [CANARIES.jwt], accept: ["application/json"] },
        body: {
          contentType: "application/json",
          value: {
            name: "Rex",
            Password: "hunter2",
            owner: { email: CANARIES.email, cards: [CANARIES.card, 4111111111111111, 42, 1.5] },
            nested: { secret: { deep: true } },
            ok: [true, null],
          },
        },
        response: {
          status: 201,
          headers: { "set-cookie": ["sid=1"], "x-request-id": ["abc"] },
          body: { contentType: "application/json", value: { token: "t", id: 1 } },
        },
      })
    );
    expect(out.path).toBe("/users/[REDACTED:path]/pets");
    expect(out.pathParams).toEqual(["[REDACTED:email]"]);
    expect(out.query).toEqual({
      token: ["[REDACTED:field]", "[REDACTED:field]"],
      q: ["[REDACTED:email]"],
      page: ["2"],
    });
    expect(out.headers).toEqual({
      authorization: ["[REDACTED:header]"],
      "x-trace": ["[REDACTED:jwt]"],
      accept: ["application/json"],
    });
    expect(out.body?.value).toEqual({
      name: "Rex",
      Password: "[REDACTED:field]",
      owner: { email: "[REDACTED:email]", cards: ["[REDACTED:card]", "[REDACTED:card]", 42, 1.5] },
      nested: { secret: "[REDACTED:field]" },
      ok: [true, null],
    });
    expect(out.response).toEqual({
      status: 201,
      headers: { "set-cookie": ["[REDACTED:header]"], "x-request-id": ["abc"] },
      body: { contentType: "application/json", value: { token: "[REDACTED:field]", id: 1 } },
    });
    expect(out.redacted).toEqual([
      "/body/Password",
      "/body/nested/secret",
      "/body/owner/cards/0",
      "/body/owner/cards/1",
      "/body/owner/email",
      "/headers/authorization",
      "/headers/x-trace",
      "/path/0",
      "/query/q",
      "/query/token",
      "/response/body/token",
      "/response/headers/set-cookie",
    ]);
    const text = JSON.stringify(out);
    for (const secret of [CANARIES.email, CANARIES.jwt, "hunter2", "4111"]) expect(text).not.toContain(secret);
  });

  it("keeps samples without sensitive data unchanged, and has no body when there was none", () => {
    const clean = sample({ path: "/pets/7", pathParams: ["7"], query: { page: ["1"] } });
    const out = redactSample(clean);
    expect(out).toEqual({ ...clean, redacted: [] });
    expect("body" in out).toBe(false);
  });

  it("accepts extra names, compares field names case-insensitively and survives bad escapes", () => {
    const out = redactSample(
      sample({ path: "/x/%E0%A4%A", pathParams: ["7"], headers: { "x-internal": ["v"] }, query: { SessionId: ["1"] } }),
      { headers: [...DEFAULT_REDACTION.headers, "X-Internal"], fields: ["sessionid"] }
    );
    expect(out.path).toBe("/x/%E0%A4%A");
    expect(out.headers).toEqual({ "x-internal": ["[REDACTED:header]"] });
    expect(out.query).toEqual({ SessionId: ["[REDACTED:field]"] });
  });
});
