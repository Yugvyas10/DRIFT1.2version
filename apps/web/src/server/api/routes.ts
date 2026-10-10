import { HttpError, problem } from "../http";
import type { Api } from "./handlers";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** A handler of `Api` and the params it takes, as a route needs it. */
type Handler = (api: Api, request: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: Method;
  /** The path as in apps/web/openapi/drift-api.yaml, with `{name}` parameters. */
  path: string;
  /** The contract's operationId. */
  operation: string;
  handle: Handler;
}

const p = <K extends string>(params: Record<string, string>) => params as Record<K, string>;

/**
 * Every route of the REST API, in one table. The Next.js catch-all route (`app/api/v1/[...path]/route.ts`)
 * and the integration tests both dispatch through it, and a test checks it against the contract in both
 * directions, so a route cannot exist without being documented, or be documented without existing.
 */
export const ROUTES: readonly Route[] = [
  { method: "POST", path: "/api/v1/auth/register", operation: "register", handle: (api, r) => api.register(r) },
  { method: "GET", path: "/api/v1/orgs", operation: "listOrgs", handle: (api, r) => api.listOrgs(r) },
  { method: "POST", path: "/api/v1/orgs", operation: "createOrg", handle: (api, r) => api.createOrg(r) },
  {
    method: "GET",
    path: "/api/v1/orgs/{org}/projects",
    operation: "listProjects",
    handle: (api, r, x) => api.listProjects(r, p<"org">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/orgs/{org}/projects",
    operation: "createProject",
    handle: (api, r, x) => api.createProject(r, p<"org">(x)),
  },
  {
    method: "GET",
    path: "/api/v1/orgs/{org}/keys",
    operation: "listKeys",
    handle: (api, r, x) => api.listKeys(r, p<"org">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/orgs/{org}/keys",
    operation: "createKey",
    handle: (api, r, x) => api.createKey(r, p<"org">(x)),
  },
  {
    method: "DELETE",
    path: "/api/v1/orgs/{org}/keys/{keyId}",
    operation: "revokeKey",
    handle: (api, r, x) => api.revokeKey(r, p<"org" | "keyId">(x)),
  },
  {
    method: "GET",
    path: "/api/v1/orgs/{org}/members",
    operation: "listMembers",
    handle: (api, r, x) => api.listMembers(r, p<"org">(x)),
  },
  {
    method: "PATCH",
    path: "/api/v1/orgs/{org}/members/{userId}",
    operation: "changeRole",
    handle: (api, r, x) => api.changeRole(r, p<"org" | "userId">(x)),
  },
  {
    method: "DELETE",
    path: "/api/v1/orgs/{org}/members/{userId}",
    operation: "removeMember",
    handle: (api, r, x) => api.removeMember(r, p<"org" | "userId">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/orgs/{org}/invitations",
    operation: "invite",
    handle: (api, r, x) => api.invite(r, p<"org">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/invitations/accept",
    operation: "acceptInvitation",
    handle: (api, r) => api.acceptInvitation(r),
  },
  {
    method: "GET",
    path: "/api/v1/orgs/{org}/projects/{project}/suppressions",
    operation: "listSuppressions",
    handle: (api, r, x) => api.listSuppressions(r, p<"org" | "project">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/orgs/{org}/projects/{project}/suppressions",
    operation: "createSuppression",
    handle: (api, r, x) => api.createSuppression(r, p<"org" | "project">(x)),
  },
  {
    method: "GET",
    path: "/api/v1/orgs/{org}/audit",
    operation: "listAudit",
    handle: (api, r, x) => api.listAudit(r, p<"org">(x)),
  },
  { method: "POST", path: "/api/v1/runs", operation: "createRun", handle: (api, r) => api.createRun(r) },
  {
    method: "GET",
    path: "/api/v1/runs/{runId}",
    operation: "getRun",
    handle: (api, r, x) => api.getRun(r, p<"runId">(x)),
  },
  {
    method: "POST",
    path: "/api/v1/runs/{runId}/complete",
    operation: "completeRun",
    handle: (api, r, x) => api.completeRun(r, p<"runId">(x)),
  },
  {
    method: "GET",
    path: "/api/v1/runs/{runId}/artifacts/{kind}",
    operation: "getArtifactUrl",
    handle: (api, r, x) => api.artifactUrl(r, p<"runId" | "kind">(x)),
  },
  {
    method: "GET",
    path: "/api/v1/projects/{project}/runs",
    operation: "listRuns",
    handle: (api, r, x) => api.listRuns(r, p<"project">(x)),
  },
  { method: "GET", path: "/healthz", operation: "liveness", handle: (api, r) => api.liveness(r) },
  { method: "GET", path: "/readyz", operation: "readiness", handle: (api, r) => api.readiness(r) },
];

/** Matches a path against a template; undefined, or the decoded parameters. */
function match(template: string, pathname: string): Record<string, string> | undefined {
  const want = template.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, segment] of want.entries()) {
    const actual = got[index] ?? "";
    if (segment.startsWith("{") && segment.endsWith("}")) {
      if (actual === "") return undefined;
      try {
        params[segment.slice(1, -1)] = decodeURIComponent(actual);
      } catch {
        return undefined;
      }
    } else if (segment !== actual) return undefined;
  }
  return params;
}

/** Runs the route for a request: 404 for an unknown path, 405 (with Allow) for a known path and another method. */
export function dispatch(api: Api, request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const candidates = ROUTES.flatMap((route) => {
    const params = match(route.path, pathname);
    return params ? [{ route, params }] : [];
  });
  const found = candidates.find(({ route }) => route.method === request.method);
  if (found) return found.route.handle(api, request, found.params);
  if (candidates.length === 0) return Promise.resolve(problem(new HttpError(404, "Not found")));
  const response = problem(new HttpError(405, "Method not allowed"));
  response.headers.set("allow", [...new Set(candidates.map(({ route }) => route.method))].join(", "));
  return Promise.resolve(response);
}
