import { MARKDOWN_MARKER } from "@drift/core";
import { describe, expect, it } from "vitest";
import { ACTIONS_BOT, keyMarker, upsertComment, type GitHubApi } from "./comment.ts";

function fakeApi(comments: { id: number; body?: string; login?: string }[], login?: string) {
  const calls: string[] = [];
  const api: GitHubApi = {
    login: () => Promise.resolve(login),
    listComments: () => Promise.resolve(comments),
    createComment: (issue, body) => {
      calls.push(`create ${String(issue)} ${body}`);
      return Promise.resolve();
    },
    updateComment: (id, body) => {
      calls.push(`update ${String(id)} ${body}`);
      return Promise.resolve();
    },
    uploadSarif: () => Promise.resolve(),
  };
  return { api, calls };
}

const report = `${MARKDOWN_MARKER}\n## DRIFT`;

describe("upsertComment", () => {
  it("creates the comment, with the key marker, when there is none", async () => {
    const { api, calls } = fakeApi([{ id: 1, body: "LGTM", login: "someone" }]);
    expect(await upsertComment(api, 7, "openapi.yaml", report)).toBe("created");
    expect(calls).toEqual([`create 7 ${report}\n${keyMarker("openapi.yaml")}\n`]);
  });

  it("updates its own latest comment for the same key", async () => {
    const mine = `${report}\n${keyMarker("openapi.yaml")}\n`;
    const { api, calls } = fakeApi([
      { id: 1, body: mine, login: ACTIONS_BOT },
      { id: 2, body: `${report}\n${keyMarker("other.yaml")}\n`, login: ACTIONS_BOT },
      { id: 3, body: mine, login: ACTIONS_BOT },
    ]);
    expect(await upsertComment(api, 7, "openapi.yaml", "new")).toBe("updated");
    expect(calls).toEqual([`update 3 new\n${keyMarker("openapi.yaml")}\n`]);
  });

  it("never updates someone else's comment that copies the markers", async () => {
    const copied = `${report}\n${keyMarker("openapi.yaml")}\n`;
    const { api, calls } = fakeApi([{ id: 9, body: copied, login: "attacker" }]);
    expect(await upsertComment(api, 7, "openapi.yaml", report)).toBe("created");
    expect(calls[0]).toMatch(/^create 7/);
  });

  it("matches on the token's own login when the token can tell it (a personal token)", async () => {
    const body = `${report}\n${keyMarker("k")}\n`;
    const { api, calls } = fakeApi([{ id: 4, body, login: "release-bot" }], "release-bot");
    expect(await upsertComment(api, 1, "k", report)).toBe("updated");
    expect(calls[0]).toMatch(/^update 4/);
  });
});
