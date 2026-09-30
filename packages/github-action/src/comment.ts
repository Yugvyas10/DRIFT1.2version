import { MARKDOWN_MARKER } from "@drift/core";

/** The GitHub API calls the Action makes. An interface, so the logic is tested without the network. */
export interface GitHubApi {
  /** The login behind the token, or undefined when the token cannot tell (GITHUB_TOKEN cannot call GET /user). */
  login(): Promise<string | undefined>;
  listComments(issue: number): Promise<{ id: number; body?: string | undefined; login?: string | undefined }[]>;
  createComment(issue: number, body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
  /** Uploads a SARIF log (gzip, then base64) to code scanning for a commit and ref. */
  uploadSarif(upload: { commitSha: string; ref: string; sarif: string }): Promise<void>;
}

/** The author of comments made with the workflow's GITHUB_TOKEN. */
export const ACTIONS_BOT = "github-actions[bot]";

/** GitHub refuses comments over 65,536 characters. */
export const COMMENT_LIMIT = 65_536;

export function keyMarker(key: string): string {
  return `<!-- drift-key: ${key} -->`;
}

/**
 * Creates this step's comment, or updates it if it exists. Only a comment by the same identity is updated, so
 * someone who pastes the markers into their own comment cannot get the report written under their name.
 */
export async function upsertComment(
  api: GitHubApi,
  issue: number,
  key: string,
  markdown: string
): Promise<"created" | "updated"> {
  const marker = keyMarker(key);
  const body = `${markdown}\n${marker}\n`;
  const me = (await api.login()) ?? ACTIONS_BOT;
  const mine = (await api.listComments(issue)).filter(
    (comment) => comment.login === me && comment.body?.includes(MARKDOWN_MARKER) && comment.body.includes(marker)
  );
  const existing = mine.at(-1);
  if (existing) {
    await api.updateComment(existing.id, body);
    return "updated";
  }
  await api.createComment(issue, body);
  return "created";
}
