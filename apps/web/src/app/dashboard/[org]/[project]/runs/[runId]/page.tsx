import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rerunAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { LiveRun } from "@/components/live-run";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { db } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { getRun, type RunView } from "@/server/services/runs";
import { listStages, type StageView } from "@/server/services/server-runs";

export const metadata: Metadata = { title: "Run" };

/** One run (PLAN M6, minimal): its status and gate, its stages live while it runs, and a re-run button. */
export default async function RunPage({
  params,
}: {
  params: Promise<{ org: string; project: string; runId: string }>;
}) {
  const { org, project, runId } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "runs:read");
  if (!actor) {
    return (
      <Shell user={user} org={org} title="Run">
        <NotAllowed what="reading runs" />
      </Shell>
    );
  }
  let run: RunView;
  let stages: StageView[];
  try {
    run = await getRun(db, actor, runId);
    stages = await listStages(db, actor, runId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  if (run.project !== project) notFound();
  const live = run.status === "queued" || run.status === "running" || run.status === "uploading";
  const settled = run.status === "complete" || run.status === "failed";

  return (
    <Shell user={user} org={org} title={`Run ${run.id}`}>
      <section className={`${ui.panel} space-y-2 text-sm`} aria-label="Run">
        <p>
          <Link className="text-muted-foreground hover:text-foreground" href={`/dashboard/${org}/${project}`}>
            ← Runs of {project}
          </Link>
        </p>
        <p>
          Status: <span data-testid="run-status">{run.status}</span> ·{" "}
          {run.mode === "server" ? "on the platform" : "uploaded"} · commit{" "}
          <span className="font-mono">{run.commit.slice(0, 7)}</span>
          {run.parentRunId !== undefined && (
            <>
              {" "}
              · re-run of{" "}
              <Link
                className="font-mono hover:text-primary"
                href={`/dashboard/${org}/${project}/runs/${run.parentRunId}`}
              >
                {run.parentRunId}
              </Link>
            </>
          )}
        </p>
        {run.gate !== undefined && run.summary !== undefined && (
          <p data-testid="gate">
            Gate{" "}
            <span className={run.gate.passed ? "text-safe" : "text-breaking"}>
              {run.gate.passed ? "passed" : "failed"}
            </span>{" "}
            (fail-on {run.gate.failOn}): <span className="text-breaking">{run.summary.breaking} breaking</span>,{" "}
            <span className="text-risky">{run.summary.risky} risky</span>,{" "}
            <span className="text-safe">{run.summary.safe} safe</span>, {run.summary.suppressed} suppressed · semver{" "}
            {run.semver}
          </p>
        )}
        {run.error !== undefined && (
          <p role="alert" className={ui.error}>
            The run failed ({run.error.category}): {run.error.message}
          </p>
        )}
      </section>

      {run.mode === "server" && (
        <LiveRun
          runId={run.id}
          live={live}
          initial={stages.map((stage) => ({ stage: stage.stage, status: stage.status, cacheHit: stage.cacheHit }))}
        />
      )}

      {run.mode === "server" && settled && can(actor, "runs:write") && (
        <section aria-labelledby="rerun" className={ui.panel}>
          <h2 id="rerun" className="font-semibold">
            Re-run
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same contracts again. Stages whose inputs did not change come from the cache. To re-run with new
            traffic: <code className="font-mono">drift rerun {run.id} --traffic &lt;file&gt;</code>
          </p>
          <div className="mt-4 max-w-md">
            <ActionForm action={rerunAction.bind(null, org, project, run.id)} submit="Re-run">
              <div>
                <label htmlFor="fail-on" className={ui.label}>
                  Fail on
                </label>
                <select id="fail-on" name="failOn" className={ui.input} defaultValue={run.gate?.failOn ?? "breaking"}>
                  <option value="breaking">BREAKING</option>
                  <option value="risky">RISKY or BREAKING</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dropTraffic" /> Without traffic
              </label>
            </ActionForm>
          </div>
        </section>
      )}
    </Shell>
  );
}
