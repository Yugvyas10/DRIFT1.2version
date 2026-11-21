import type { StageName } from "@drift/report-schema";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangesTable, isChangeFilter } from "@/components/run/changes-table";
import { inspectorPanels } from "@/components/run/inspectors";
import { RunCanvas } from "@/components/run-canvas";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { CANVAS_STAGES, type CanvasStageId, type EngineStageState } from "@/lib/canvas";
import { can } from "@/server/auth/actor";
import { db, store } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { listArtifacts, loadReport } from "@/server/services/run-detail";
import { getRun, type RunView } from "@/server/services/runs";
import { listStages, type StageView } from "@/server/services/server-runs";

export const metadata: Metadata = { title: "Run" };

function engineState(stage: StageView): EngineStageState {
  const duration =
    stage.startedAt !== undefined && stage.finishedAt !== undefined
      ? new Date(stage.finishedAt).getTime() - new Date(stage.startedAt).getTime()
      : undefined;
  return {
    stage: stage.stage as StageName,
    status: stage.status,
    cacheHit: stage.cacheHit,
    attempt: stage.attempt,
    ...(duration === undefined ? {} : { durationMs: duration }),
  };
}

/**
 * The run canvas (PLAN M7): the run's six stages, live while it runs, each with an inspector of its real inputs,
 * outputs, timings, artifacts and evidence; re-runs from a stage; and the run's changes.
 */
export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string; runId: string }>;
  searchParams: Promise<{ stage?: string; label?: string; page?: string }>;
}) {
  const { org, project, runId } = await params;
  const query = await searchParams;
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
  const [report, artifacts] = await Promise.all([loadReport(db, store, actor, runId), listArtifacts(db, actor, runId)]);
  const live =
    run.mode === "server" && (run.status === "queued" || run.status === "running" || run.status === "uploading");
  const basePath = `/dashboard/${org}/${project}/runs/${run.id}`;
  const selected: CanvasStageId =
    CANVAS_STAGES.find((info) => info.id === query.stage)?.id ?? (run.status === "complete" ? "report" : "ingest");
  const panels = inspectorPanels({ org, project, run, stages, report, artifacts, canRerun: can(actor, "runs:write") });

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
          {run.mode === "server" ? "run on the platform" : "uploaded from CI or a machine"} · {run.trigger} · commit{" "}
          <span className="font-mono">{run.commit.slice(0, 7)}</span>
          {run.branch !== undefined && (
            <>
              {" "}
              on <span className="font-mono">{run.branch}</span>
            </>
          )}
          {run.pullRequest !== undefined && ` · PR ${String(run.pullRequest)}`}
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
            (fails on {run.gate.failOn}): <span className="text-breaking">{run.summary.breaking} breaking</span>,{" "}
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

      <RunCanvas
        key={`${run.status}:${String(stages.length)}`}
        runId={run.id}
        live={live}
        runStatus={run.status}
        initialStages={stages.map(engineState)}
        panels={panels}
        initialSelected={selected}
      />

      {report && (
        <ChangesTable
          report={report}
          basePath={basePath}
          filter={isChangeFilter(query.label) ? query.label : "all"}
          page={Number(query.page ?? "1") || 1}
        />
      )}
    </Shell>
  );
}
