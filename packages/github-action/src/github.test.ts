import { describe, expect, it } from "vitest";
import { createGitHubApi } from "./github.ts";

/** A fake GitHub REST API: records each request and answers from `routes` ("GET /path" → status and JSON). */
function fakeFetch(routes: Record<string, { status: number; body: unknown; headers?: Record<string, string> }>) {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url: url.pathname + url.search,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const route = routes[`${method} ${url.pathname}${url.search}`] ?? routes[`${method} ${url.pathname}`];
    const status = route?.status ?? 404;
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(route?.body ?? { message: "Not Found" }), {
        status,
        headers: { "content-type": "application/json", ...route?.headers },
      })
    );
  };
  return { fetch, requests };
}

const repo = { owner: "acme", repo: "api" };

describe("createGitHubApi", () => {
  it("lists every page of comments, and creates and updates comments", async () => {
    const next = '<https://api.github.com/repositories/1/issues/7/comments?per_page=100&page=2>; rel="next"';
    const { fetch, requests } = fakeFetch({
      "GET /repos/acme/api/issues/7/comments?per_page=100": {
        status: 200,
        body: [{ id: 1, body: "a", user: { login: "x" } }],
        headers: { link: next },
      },
      "GET /repositories/1/issues/7/comments?per_page=100&page=2": {
        status: 200,
        body: [{ id: 2, body: "b", user: null }],
      },
      "POST /repos/acme/api/issues/7/comments": { status: 201, body: { id: 3 } },
      "PATCH /repos/acme/api/issues/comments/2": { status: 200, body: { id: 2 } },
    });
    const api = createGitHubApi("t0ken", repo, fetch);
    expect(await api.listComments(7)).toEqual([
      { id: 1, body: "a", login: "x" },
      { id: 2, body: "b", login: undefined },
    ]);
    await api.createComment(7, "hello");
    await api.updateComment(2, "again");
    expect(requests.slice(2)).toEqual([
      { method: "POST", url: "/repos/acme/api/issues/7/comments", body: { body: "hello" } },
      { method: "PATCH", url: "/repos/acme/api/issues/comments/2", body: { body: "again" } },
    ]);
  });

  it("reads the token's login, or undefined when the token cannot tell (GITHUB_TOKEN)", async () => {
    const user = fakeFetch({ "GET /user": { status: 200, body: { login: "release-bot" } } });
    expect(await createGitHubApi("t", repo, user.fetch).login()).toBe("release-bot");
    const installation = fakeFetch({
      "GET /user": { status: 403, body: { message: "Resource not accessible by integration" } },
    });
    expect(await createGitHubApi("t", repo, installation.fetch).login()).toBeUndefined();
  });

  it("uploads SARIF to code scanning", async () => {
    const { fetch, requests } = fakeFetch({
      "POST /repos/acme/api/code-scanning/sarifs": { status: 202, body: { id: "x" } },
    });
    await createGitHubApi("t", repo, fetch).uploadSarif({
      commitSha: "a".repeat(40),
      ref: "refs/pull/7/merge",
      sarif: "H4sI",
    });
    expect(requests[0]?.body).toEqual({
      commit_sha: "a".repeat(40),
      ref: "refs/pull/7/merge",
      sarif: "H4sI",
      tool_name: "DRIFT",
    });
  });

  it("surfaces an API error to the caller", async () => {
    const { fetch } = fakeFetch({});
    await expect(createGitHubApi("t", repo, fetch).createComment(7, "x")).rejects.toThrow();
  });
});
