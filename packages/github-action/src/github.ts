import { getOctokit } from "@actions/github";
import type { GitHubApi } from "./comment.ts";

/**
 * The GitHub REST API through the official toolkit (@actions/github), for one repository. `fetch` replaces the
 * toolkit's HTTP client (tests only).
 */
export function createGitHubApi(
  token: string,
  repo: { owner: string; repo: string },
  fetch?: typeof globalThis.fetch
): GitHubApi {
  const octokit = getOctokit(token, fetch ? { request: { fetch } } : {});
  return {
    async login() {
      try {
        return (await octokit.rest.users.getAuthenticated()).data.login;
      } catch {
        return undefined; // an installation token such as GITHUB_TOKEN cannot call GET /user
      }
    },
    async listComments(issue) {
      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        ...repo,
        issue_number: issue,
        per_page: 100,
      });
      return comments.map((comment) => ({ id: comment.id, body: comment.body, login: comment.user?.login }));
    },
    async createComment(issue, body) {
      await octokit.rest.issues.createComment({ ...repo, issue_number: issue, body });
    },
    async updateComment(id, body) {
      await octokit.rest.issues.updateComment({ ...repo, comment_id: id, body });
    },
    async uploadSarif({ commitSha, ref, sarif }) {
      await octokit.rest.codeScanning.uploadSarif({ ...repo, commit_sha: commitSha, ref, sarif, tool_name: "DRIFT" });
    },
  };
}
