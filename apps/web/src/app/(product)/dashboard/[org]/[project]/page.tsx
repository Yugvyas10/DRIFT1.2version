import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { db } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { listRuns, RunFilter, type RunView } from "@/server/services/runs";

export const metadata: Metadata = { title: "Runs" };

/** The run list (PLAN M7): newest first, filtered by status, gate, mode and branch, in pages. */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, project } = await params;
  const query = await searchParams;
  const user = await pageUser();
  const actor = await pageActor(org, "runs:read");
  if (!actor) notFound();
  // Unknown or empty values are ignored rather than refused: they come from a URL someone may have edited.
  const candidate = Object.fromEntries(
    (["status", "gate", "mode", "branch"] as const).flatMap((name) => {
      const value = query[name]?.trim();
      return value === undefined || value === "" ? [] : [[name, value]];
    })
  );
  const parsed = RunFilter.safeParse(candidate);
  const filter = parsed.success ? parsed.data : {};
  let page: { runs: RunView[]; nextCursor?: string };
  try {
    page = await listRuns(db, actor, project, { limit: 50, filter, cursor: query.cursor });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    if (error instanceof HttpError && error.status === 400) page = { runs: [] };
    else throw error;
  }
  const filtered = Object.keys(filter).length > 0;
  const next = (cursor: string) => {
    const search = new URLSearchParams(Object.entries(filter));
    search.set("cursor", cursor);
    return `/dashboard/${org}/${project}?${search.toString()}`;
  };

  return (
    <Shell user={user} org={org} title={`Runs of ${project}`}>
      <p className="text-sm">
        <Link className="text-primary hover:underline" href={`/dashboard/${org}/${project}/settings`}>
          Project settings: policy, suppressions, GitHub Action setup
        </Link>
      </p>
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter runs">
        <div>
          <label htmlFor="filter-status" className={ui.label}>
            Status
          </label>
          <select id="filter-status" name="status" defaultValue={filter.status ?? ""} className={ui.input}>
            <option value="">any</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="complete">complete</option>
            <option value="failed">failed</option>
            <option value="uploading">uploading</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-gate" className={ui.label}>
            Gate
          </label>
          <select id="filter-gate" name="gate" defaultValue={filter.gate ?? ""} className={ui.input}>
            <option value="">any</option>
            <option value="passed">passed</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-mode" className={ui.label}>
            Mode
          </label>
          <select id="filter-mode" name="mode" defaultValue={filter.mode ?? ""} className={ui.input}>
            <option value="">any</option>
            <option value="server">on the platform</option>
            <option value="upload">uploaded</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-branch" className={ui.label}>
            Branch
          </label>
          <input id="filter-branch" name="branch" defaultValue={filter.branch ?? ""} className={ui.input} />
        </div>
        <button type="submit" className={ui.buttonQuiet}>
          Filter
        </button>
        {filtered && (
          <Link className="text-sm text-muted-foreground hover:text-foreground" href={`/dashboard/${org}/${project}`}>
            Clear
          </Link>
        )}
      </form>
      {page.runs.length === 0 ? (
        <div className={ui.panel}>
          {filtered ? (
            <p>No runs match these filters.</p>
          ) : (
            <>
              <p>No runs yet. Upload one from CI or your machine, or run one on the platform:</p>
              <pre tabIndex={0} className="mt-3 overflow-x-auto font-mono text-xs text-muted-foreground">
                {`DRIFT_API_KEY=drift_… drift compare --base <old> --head <new> --upload --project ${project}\n# or run it on the platform:\nDRIFT_API_KEY=drift_… drift run --base <old> --head <new> --project ${project}`}
              </pre>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Runs, newest first</caption>
            <thead>
              <tr className="border-b border-border">
                {["When", "Commit", "Branch", "Mode", "Gate", "Breaking", "Risky", "Safe", "Status"].map((heading) => (
                  <th key={heading} scope="col" className={ui.th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.runs.map((run) => (
                <tr key={run.id} data-testid="run" className="border-b border-border/60">
                  <td className={ui.td}>
                    <Link className="hover:text-primary" href={`/dashboard/${org}/${project}/runs/${run.id}`}>
                      <time dateTime={run.createdAt}>{run.createdAt.replace("T", " ").slice(0, 16)} UTC</time>
                    </Link>
                  </td>
                  <td className={`font-mono ${ui.td}`}>
                    {run.commit.slice(0, 7)}
                    {run.pullRequest !== undefined && ` · PR ${String(run.pullRequest)}`}
                  </td>
                  <td className={`font-mono text-xs ${ui.td}`}>{run.branch ?? "—"}</td>
                  <td className={ui.td}>
                    {run.mode === "server" ? "platform" : "uploaded"}
                    {run.parentRunId !== undefined && (
                      <span className="block text-xs text-muted-foreground">re-run</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    {run.gate === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={run.gate.passed ? "text-safe" : "text-breaking"}>
                        {run.gate.passed ? "passed" : "failed"}
                      </span>
                    )}
                  </td>
                  <td className={`text-breaking ${ui.td}`}>{run.summary?.breaking ?? "—"}</td>
                  <td className={`text-risky ${ui.td}`}>{run.summary?.risky ?? "—"}</td>
                  <td className={`text-safe ${ui.td}`}>{run.summary?.safe ?? "—"}</td>
                  <td className={ui.td}>{run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.nextCursor !== undefined && (
        <p className="text-sm">
          <Link className="text-primary hover:underline" href={next(page.nextCursor)}>
            Older runs
          </Link>
        </p>
      )}
    </Shell>
  );
}
