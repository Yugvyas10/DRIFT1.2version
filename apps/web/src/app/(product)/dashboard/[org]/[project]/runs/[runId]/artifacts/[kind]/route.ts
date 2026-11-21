import { db, store } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor } from "@/server/page";
import { artifactUrl, getRun } from "@/server/services/runs";

/**
 * Downloads one of a run's files from the run page: the same checks as the page (signed-in member with
 * runs:read), then a redirect to a short-lived signed URL. Links on the page stay valid however long it is open.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; project: string; runId: string; kind: string }> }
): Promise<Response> {
  const { org, project, runId, kind } = await params;
  const actor = await pageActor(org, "runs:read");
  if (!actor) return new Response("Your role does not include reading runs.", { status: 403 });
  try {
    const run = await getRun(db, actor, runId);
    if (run.project !== project) return new Response("Not found", { status: 404 });
    const { url } = await artifactUrl(db, store, actor, runId, kind);
    return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HttpError) return new Response(error.title, { status: error.status });
    throw error;
  }
}
