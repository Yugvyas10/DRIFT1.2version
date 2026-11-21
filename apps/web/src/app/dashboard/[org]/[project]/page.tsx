import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { db } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { listRuns, type RunView } from "@/server/services/runs";

export const metadata: Metadata = { title: "Runs" };

/** The minimal run list of M5: one row per uploaded run, newest first. The run canvas arrives in M7. */
export default async function ProjectPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "runs:read");
  if (!actor) notFound();
  let runs: RunView[];
  try {
    runs = (await listRuns(db, actor, project, { limit: 50 })).runs;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return (
    <Shell user={user} org={org} title={`Runs of ${project}`}>
      {runs.length === 0 ? (
        <div className={ui.panel}>
          <p>No runs yet. Upload one from CI or your machine:</p>
          <pre className="mt-3 overflow-x-auto font-mono text-xs text-muted-foreground">
            {`DRIFT_API_KEY=drift_… drift compare --base <old> --head <new> --upload --project ${project}`}
          </pre>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Runs, newest first</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={ui.th}>
                  When
                </th>
                <th scope="col" className={ui.th}>
                  Commit
                </th>
                <th scope="col" className={ui.th}>
                  Gate
                </th>
                <th scope="col" className={ui.th}>
                  Breaking
                </th>
                <th scope="col" className={ui.th}>
                  Risky
                </th>
                <th scope="col" className={ui.th}>
                  Safe
                </th>
                <th scope="col" className={ui.th}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} data-testid="run" className="border-b border-border/60">
                  <td className={ui.td}>
                    <time dateTime={run.createdAt}>{run.createdAt.replace("T", " ").slice(0, 16)} UTC</time>
                  </td>
                  <td className={`font-mono ${ui.td}`}>
                    {run.commit.slice(0, 7)}
                    {run.pullRequest !== undefined && ` · PR ${String(run.pullRequest)}`}
                  </td>
                  <td className={ui.td}>
                    <span className={run.gate.passed ? "text-safe" : "text-breaking"}>
                      {run.gate.passed ? "passed" : "failed"}
                    </span>
                  </td>
                  <td className={`text-breaking ${ui.td}`}>{run.summary.breaking}</td>
                  <td className={`text-risky ${ui.td}`}>{run.summary.risky}</td>
                  <td className={`text-safe ${ui.td}`}>{run.summary.safe}</td>
                  <td className={ui.td}>{run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
