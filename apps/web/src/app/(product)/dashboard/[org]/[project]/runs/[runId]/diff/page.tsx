import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isChangeFilter, matches, type ChangeFilter } from "@/components/run/changes-table";
import { Snippet } from "@/components/run/snippet";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { db, store } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { loadContracts, loadReport, locateChanges } from "@/server/services/run-detail";
import { getRun } from "@/server/services/runs";

export const metadata: Metadata = { title: "Contract diff" };

/** Changes per page of the diff view. */
const PAGE_SIZE = 50;

const LABEL_STYLE = { BREAKING: "text-breaking", RISKY: "text-risky", SAFE: "text-safe" } as const;

const UNAVAILABLE = {
  uploaded: "An uploaded run has only its report: the contracts stay in the repository that ran the CLI.",
  missing: "The run's contracts are not in storage.",
  "too-large": "The contracts are too large to show here (over 5 MiB). Every change is in the run's reports.",
} as const;

/**
 * The contract diff (PLAN M7): every change of the run with the old and the new contract side by side at its
 * location, located by the engine in the stored contracts.
 */
export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string; runId: string }>;
  searchParams: Promise<{ label?: string; page?: string }>;
}) {
  const { org, project, runId } = await params;
  const query = await searchParams;
  const user = await pageUser();
  const actor = await pageActor(org, "runs:read");
  if (!actor) {
    return (
      <Shell user={user} org={org} title="Contract diff">
        <NotAllowed what="reading runs" />
      </Shell>
    );
  }
  let loaded;
  try {
    const run = await getRun(db, actor, runId);
    if (run.project !== project) notFound();
    loaded = await Promise.all([loadReport(db, store, actor, runId), loadContracts(db, store, actor, runId)]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const [report, contracts] = loaded;
  const runPath = `/dashboard/${org}/${project}/runs/${runId}`;
  const back = (
    <p className="text-sm">
      <Link className="text-muted-foreground hover:text-foreground" href={runPath}>
        ← Run {runId}
      </Link>
    </p>
  );
  if (!report || !contracts.available) {
    return (
      <Shell user={user} org={org} title="Contract diff">
        {back}
        <p className={ui.panel}>
          {report ? UNAVAILABLE[contracts.available ? "missing" : contracts.reason] : "The run has no report yet."}
        </p>
      </Shell>
    );
  }

  const filter: ChangeFilter = isChangeFilter(query.label) ? query.label : "all";
  const changes = report.changes.filter((change) => matches(change, filter));
  const pages = Math.max(1, Math.ceil(changes.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page ?? "1") || 1, 1), pages);
  const shown = changes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const lines = await locateChanges(report, contracts);
  const base = contracts.base.split(/\r?\n/);
  const head = contracts.head.split(/\r?\n/);
  const href = (next: { filter?: ChangeFilter; page?: number }) => {
    const search = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") search.set("label", f);
    if ((next.page ?? 1) > 1) search.set("page", String(next.page));
    const text = search.toString();
    return `${runPath}/diff${text === "" ? "" : `?${text}`}`;
  };

  return (
    <Shell user={user} org={org} title="Contract diff">
      {back}
      <p className="text-sm text-muted-foreground">
        <span className="font-mono">{report.base.file}</span> ({report.base.version}) →{" "}
        <span className="font-mono">{report.head.file}</span> ({report.head.version}): {report.changes.length} changes.
      </p>
      <nav aria-label="Filter changes by label" className="flex flex-wrap gap-2 text-sm">
        {(["all", "breaking", "risky", "safe", "suppressed"] as const).map((option) => (
          <Link
            key={option}
            href={href({ filter: option })}
            aria-current={option === filter ? "page" : undefined}
            className={`rounded-md border px-2 py-1 ${option === filter ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {option}
          </Link>
        ))}
      </nav>
      <ol className="space-y-6">
        {shown.map((change) => {
          const at = lines.get(change.id) ?? {};
          const tone = LABEL_STYLE[change.severity];
          return (
            <li key={change.id} className="glass-panel rounded-lg" data-testid="diff-change">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 text-sm">
                <span className={tone}>{change.severity}</span>
                <Link className="font-medium hover:text-primary" href={`${runPath}/changes/${change.id}`}>
                  {change.message}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{change.operation}</span>
              </header>
              <div className="grid divide-border/60 md:grid-cols-2 md:divide-x">
                <section className="min-w-0" aria-label={`Old contract at the change ${change.id}`}>
                  <h3 className="px-3 pt-2 text-xs text-muted-foreground uppercase">Old (base)</h3>
                  <Snippet lines={base} line={at.base} side="base" tone={tone} />
                </section>
                <section className="min-w-0" aria-label={`New contract at the change ${change.id}`}>
                  <h3 className="px-3 pt-2 text-xs text-muted-foreground uppercase">New (head)</h3>
                  <Snippet lines={head} line={at.head} side="head" tone={tone} />
                </section>
              </div>
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <nav aria-label="Pages of changes" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={href({ page: page - 1 })}>Previous</Link>}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={href({ page: page + 1 })}>Next</Link>}
        </nav>
      )}
    </Shell>
  );
}
