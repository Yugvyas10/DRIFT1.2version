import { describe, expect, it } from "vitest";
import { issueSessionToken, sessionCookieName, sessionReader } from "./session";

const secret = "s".repeat(32);
const request = (cookie?: string, headers: Record<string, string> = {}) =>
  new Request("http://drift.test/api/v1/orgs", {
    headers: { ...(cookie === undefined ? {} : { cookie }), ...headers },
  });

describe("sessionReader", () => {
  it("reads the claims from next-auth's session cookie", async () => {
    const token = await issueSessionToken({ userId: "usr_1", tokenVersion: 3 }, secret);
    const read = sessionReader(secret, false);
    expect(await read(request(`theme=dark; next-auth.session-token=${token}; other=1`))).toEqual({
      userId: "usr_1",
      tokenVersion: 3,
    });
  });

  it("uses the __Secure- cookie over HTTPS and ignores the plain one there", async () => {
    const token = await issueSessionToken({ userId: "usr_1", tokenVersion: 0 }, secret);
    expect(sessionCookieName(true)).toBe("__Secure-next-auth.session-token");
    const secure = sessionReader(secret, true);
    expect(await secure(request(`__Secure-next-auth.session-token=${token}`))).toEqual({
      userId: "usr_1",
      tokenVersion: 0,
    });
    expect(await secure(request(`next-auth.session-token=${token}`))).toBeUndefined();
  });

  it("refuses a missing, forged, foreign-secret or expired token, and a token in the Authorization header", async () => {
    const read = sessionReader(secret, false);
    const token = await issueSessionToken({ userId: "usr_1", tokenVersion: 0 }, secret);
    expect(await read(request())).toBeUndefined();
    expect(await read(request("next-auth.session-token=not-a-token"))).toBeUndefined();
    expect(await read(request(`next-auth.session-token=${token.slice(0, -4)}AAAA`))).toBeUndefined();
    const foreign = await issueSessionToken({ userId: "usr_1", tokenVersion: 0 }, "t".repeat(32));
    expect(await read(request(`next-auth.session-token=${foreign}`))).toBeUndefined();
    const expired = await issueSessionToken({ userId: "usr_1", tokenVersion: 0 }, secret, -60);
    expect(await read(request(`next-auth.session-token=${expired}`))).toBeUndefined();
    expect(await read(request(undefined, { authorization: `Bearer ${token}` }))).toBeUndefined();
  });
});
