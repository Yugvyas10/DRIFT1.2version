import { createRedis } from "@drift/platform";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "./api/handlers";
import { dispatch } from "./api/routes";
import { HttpError } from "./http";
import { clientAddress, createRateLimits } from "./rate-limit";
import { harness } from "./testing/harness";

const h = harness();

describe("rate limits", () => {
  it("allow the configured number of uses per key, then answer 429 with Retry-After", async () => {
    const limits = createRateLimits(h.redis, { login: { points: 2, duration: 60 } });
    const key = h.unique("someone@example.com");
    await limits.consume("login", key);
    await limits.consume("login", key);
    const refused = await limits.consume("login", key).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpError);
    expect(refused).toMatchObject({ status: 429 });
    const retryAfter = Number((refused as HttpError).headers["retry-after"]);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    // Another key has its own allowance.
    await expect(limits.consume("login", h.unique("other@example.com"))).resolves.toBeUndefined();
  });

  it("let requests through when Redis is down, and report it", async () => {
    const down = createRedis("redis://127.0.0.1:9", { failFast: true });
    down.on("error", () => undefined);
    const onError = vi.fn();
    const limits = createRateLimits(down, {}, onError);
    await expect(limits.consume("api", "key_1")).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
    down.disconnect();
  });

  it("apply to every authenticated API call, per caller, and to registration per address", async () => {
    const org = await h.org();
    const limited = createApi({
      ...h,
      limits: createRateLimits(h.redis, { api: { points: 3, duration: 60 }, register: { points: 1, duration: 60 } }),
      session: (request) => {
        const userId = request.headers.get("x-test-session");
        return Promise.resolve(userId ? { userId, tokenVersion: 0 } : undefined);
      },
      passwordCost: 4,
    });
    const list = (userId: string) =>
      dispatch(limited, new Request("http://drift.test/api/v1/orgs", { headers: { "x-test-session": userId } }));
    for (let i = 0; i < 3; i += 1) expect((await list(org.owner.id)).status).toBe(200);
    const refused = await list(org.owner.id);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toMatch(/^[0-9]+$/);
    expect(await refused.json()).toMatchObject({ status: 429, title: "Too many requests" });

    const address = `203.0.113.${String(Math.floor(Math.random() * 250))}`;
    const register = (email: string) =>
      dispatch(
        limited,
        new Request("http://drift.test/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.1, ${address}` },
          body: JSON.stringify({ email, password: "correct horse battery" }),
        })
      );
    expect((await register(`${h.unique("a")}@example.com`)).status).toBe(201);
    expect((await register(`${h.unique("b")}@example.com`)).status).toBe(429);
  });
});

describe("clientAddress", () => {
  it("takes the address the nearest proxy added, not what the client claims", () => {
    const request = (forwarded?: string) =>
      new Request("http://drift.test/", forwarded === undefined ? {} : { headers: { "x-forwarded-for": forwarded } });
    expect(clientAddress(request("1.2.3.4, 10.0.0.7"))).toBe("10.0.0.7");
    expect(clientAddress(request("10.0.0.7"))).toBe("10.0.0.7");
    expect(clientAddress(request())).toBe("unknown");
    expect(clientAddress(request(""))).toBe("unknown");
  });
});
