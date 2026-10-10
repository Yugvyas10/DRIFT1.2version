import { evidenceSummary, omittedBody } from "@drift/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { suppressChangeAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { db, store } from "@/server/context";
import { HttpError } from "@/server/http";
import { pageActor, pageUser } from "@/server/page";
import { loadReport } from "@/server/services/run-detail";
import { getRun } from "@/server/services/runs";

export const metadata: Metadata = { title: "Change" };

const LABEL_STYLE = { BREAKING: "text-breaking", RISKY: "text-risky", SAFE: "text-safe" } as const;

/** One change of a run (PLAN M7): what changed, the rule and its rationale, and the evidence with its samples. */
export default async function ChangePage({
  params,
}: {
  params: Promise<{ org: string; project: string; runId: string; changeId: string }>;
}) {
  const { org, project, runId, changeId } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "runs:read");
  if (!actor) {
    return (
      <Shell user={user} org={org} title="Change">
        <NotAllowed what="reading runs" />
      </Shell>
    );
  }
  let report;
  try {
    const run = await getRun(db, actor, runId);
    if (run.project !== project) notFound();
    report = await loadReport(db, store, actor, runId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const change = report?.changes.find((candidate) => candidate.id === changeId);
  if (!change) notFound();
  const runPath = `/dashboard/${org}/${project}/runs/${runId}`;
  const evidence = change.evidence;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Shell user={user} org={org} title={change.message}>
      <p className="text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href={`${runPath}#changes`}>
          ← Run {runId}
        </Link>
      </p>

      <section aria-labelledby="what" className={`${ui.panel} space-y-3`}>
        <h2 id="what" className="font-semibold">
          <span className={LABEL_STYLE[change.severity]} data-testid="change-label">
            {change.severity}
          </span>
          {change.suppression !== undefined && <span className="ml-2 text-sm text-muted-foreground">suppressed</span>}
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Operation</dt>
          <dd className="font-mono">{change.operation}</dd>
          <dt className="text-muted-foreground">Direction</dt>
          <dd>{change.direction === "request" ? "request (what the server accepts)" : "response (what it returns)"}</dd>
          <dt className="text-muted-foreground">Kind</dt>
          <dd className="font-mono">{change.kind}</dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd className="font-mono break-all">
            {change.location}
            {change.position !== undefined &&
              ` (${change.position.file}:${String(change.position.line)}:${String(change.position.column)}, ${change.side})`}
          </dd>
          <dt className="text-muted-foreground">Change id</dt>
          <dd className="font-mono">{change.id}</dd>
        </dl>
      </section>

      <section aria-labelledby="rule" className={`${ui.panel} space-y-2 text-sm`}>
        <h2 id="rule" className="font-semibold">
          Rule <span className="font-mono">{change.ruleId}</span>
        </h2>
        <p>{change.rationale}</p>
        <p className="text-muted-foreground">
          Confidence:{" "}
          {change.confidence === null
            ? "structural only (samples cannot prove or disprove it)"
            : change.confidence.toFixed(2)}
          {change.unverified && " · unverified: no recorded request reached it"}
        </p>
        {change.escalation !== undefined && <p className="text-risky">Escalated by the policy: {change.escalation}</p>}
        {change.suppression !== undefined && (
          <p>
            Suppressed until {change.suppression.expiresAt}: {change.suppression.reason}
          </p>
        )}
      </section>

      <section aria-labelledby="evidence" className={`${ui.panel} space-y-3 text-sm`}>
        <h2 id="evidence" className="font-semibold">
          Evidence
        </h2>
        <p data-testid="evidence-summary">{evidenceSummary(change)}</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Reached it</dt>
          <dd>
            {evidence.checked.recorded} recorded, {evidence.checked.synthetic} synthetic samples
          </dd>
          <dt className="text-muted-foreground">Fail because of it</dt>
          <dd>
            {evidence.failed.recorded} recorded, {evidence.failed.synthetic} synthetic
          </dd>
          <dt className="text-muted-foreground">Unknown</dt>
          <dd>{evidence.unknown} (the only failure was at a redacted value, so it never counts as a failure)</dd>
        </dl>
        {evidence.examples.map((example) => {
          const omitted = omittedBody(example);
          return (
            <article key={example.sample} className="space-y-2 border-t border-border/60 pt-3" data-testid="example">
              <h3 className="font-medium">
                Failing sample: {example.origin}
                {example.line !== undefined && `, traffic line ${String(example.line)}`}
                {example.origin === "synthetic" && (
                  <span className="text-muted-foreground"> (generated from the old contract, not real traffic)</span>
                )}
              </h3>
              <pre tabIndex={0} className="overflow-x-auto rounded-md bg-background-2 p-3 font-mono text-xs">
                {JSON.stringify(example.payload, null, 2)}
              </pre>
              {omitted !== undefined && (
                <pre tabIndex={0} className="overflow-x-auto rounded-md bg-background-2 p-3 font-mono text-xs">
                  {omitted}
                </pre>
              )}
              {example.redacted.length > 0 && (
                <p className="text-muted-foreground">
                  Redacted: <span className="font-mono">{example.redacted.join(", ")}</span>
                </p>
              )}
              <ul className="space-y-1">
                {example.errors.map((error) => (
                  <li key={`${error.pointer}:${error.keyword}`}>
                    <span className="font-mono">{error.pointer}</span> ({error.keyword}): {error.message}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      {change.suppression === undefined && actor.kind === "user" && can(actor, "suppressions:write") && (
        <section aria-labelledby="suppress" className={ui.panel}>
          <h2 id="suppress" className="font-semibold">
            Suppress this change
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept it for this project until a date, with a reason. It stays in every report, marked as suppressed, and
            stops counting towards the gate of the project&apos;s server-side runs from the next one.
          </p>
          <div className="mt-4 max-w-md">
            <ActionForm action={suppressChangeAction.bind(null, org, project, change.id)} submit="Suppress">
              <div>
                <label htmlFor="reason" className={ui.label}>
                  Reason (at least 10 characters)
                </label>
                <input id="reason" name="reason" required minLength={10} maxLength={500} className={ui.input} />
              </div>
              <div>
                <label htmlFor="expires" className={ui.label}>
                  Until
                </label>
                <input id="expires" name="expiresAt" type="date" required min={today} className={ui.input} />
              </div>
            </ActionForm>
          </div>
        </section>
      )}
    </Shell>
  );
}
