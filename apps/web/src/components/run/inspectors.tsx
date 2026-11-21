import type { Report, ReportDiagnostic, StageName } from "@drift/report-schema";
import Link from "next/link";
import type { ReactNode } from "react";
import { CANVAS_STAGES, diagnosticStage, formatBytes, type CanvasStageId } from "@/lib/canvas";
import type { RunView } from "@/server/services/runs";
import type { ArtifactView } from "@/server/services/run-detail";
import type { StageView } from "@/server/services/server-runs";
import { ui } from "../ui";
import { RerunStageForm } from "./rerun-stage-form";

export interface InspectorContext {
  org: string;
  project: string;
  run: RunView;
  stages: StageView[];
  report: Report | undefined;
  artifacts: ArtifactView[];
  /** The signed-in member may start re-runs. */
  canRerun: boolean;
}

const runPath = (context: InspectorContext) => `/dashboard/${context.org}/${context.project}/runs/${context.run.id}`;
const short = (hash: string) => hash.slice(0, 12);

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** The engine stages of a node: attempt, status, cache hit, key and time, from the stage rows. */
function Executions({ engine, stages }: { engine: readonly StageName[]; stages: StageView[] }) {
  const rows = stages.filter((stage) => (engine as readonly string[]).includes(stage.stage));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Not started.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Stage executions</caption>
        <thead>
          <tr className="border-b border-border">
            {["Stage", "Attempt", "Status", "Cache", "Time"].map((heading) => (
              <th key={heading} scope="col" className={ui.th}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const time =
              row.startedAt !== undefined && row.finishedAt !== undefined
                ? `${String(new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime())} ms`
                : "—";
            return (
              <tr key={row.stage} className="border-b border-border/60">
                <td className={`font-mono ${ui.td}`}>{row.stage}</td>
                <td className={ui.td}>{row.attempt}</td>
                <td className={ui.td}>{row.status}</td>
                <td className={ui.td}>{row.cacheHit ? "hit (reused)" : "miss (computed)"}</td>
                <td className={ui.td}>{time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Diagnostics({ items }: { items: ReportDiagnostic[] }) {
  if (items.length === 0) return null;
  return (
    <Section title="Diagnostics">
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={`${item.code}:${item.message}`} className={item.level === "warning" ? "text-risky" : ""}>
            <span className="font-mono text-xs">{item.code}</span> {item.message}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ArtifactLinks({ context, kinds }: { context: InspectorContext; kinds: string[] }) {
  const shown = context.artifacts.filter((artifact) => kinds.includes(artifact.kind));
  if (shown.length === 0) return null;
  return (
    <Section title="Artifacts">
      <ul className="space-y-1 text-sm">
        {shown.map((artifact) => (
          <li key={artifact.kind}>
            <a className="font-mono hover:text-primary" href={`${runPath(context)}/artifacts/${artifact.kind}`}>
              {artifact.kind}
            </a>{" "}
            <span className="text-muted-foreground">
              {formatBytes(artifact.size)} · sha256 {short(artifact.sha256)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function NoReport({ context }: { context: InspectorContext }) {
  const { run } = context;
  return (
    <p className="text-sm text-muted-foreground">
      {run.status === "failed"
        ? "The run failed before this stage produced a result."
        : "The result appears here when the run is complete."}
    </p>
  );
}

function Header({ id }: { id: CanvasStageId }) {
  const info = CANVAS_STAGES.find((stage) => stage.id === id);
  return (
    <header className="space-y-1">
      <h3 className="font-semibold">{info?.title}</h3>
      <p className="text-sm text-muted-foreground">{info?.purpose}</p>
    </header>
  );
}

function diagnosticsOf(report: Report | undefined, id: CanvasStageId): ReportDiagnostic[] {
  return (report?.diagnostics ?? []).filter((item) => diagnosticStage(item.code) === id);
}

function IngestPanel({ context }: { context: InspectorContext }) {
  const { report } = context;
  return (
    <div className="space-y-5">
      <Header id="ingest" />
      <Executions engine={["ingest.base", "ingest.head"]} stages={context.stages} />
      {report ? (
        <Section title="Contracts">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">The two contracts</caption>
              <thead>
                <tr className="border-b border-border">
                  {["", "File", "OpenAPI", "Title", "Version", "Operations", "Spec hash"].map((heading) => (
                    <th key={heading} scope="col" className={ui.th}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Base", report.base],
                    ["Head", report.head],
                  ] as const
                ).map(([side, spec]) => (
                  <tr key={side} className="border-b border-border/60">
                    <th scope="row" className={ui.td}>
                      {side}
                    </th>
                    <td className={`font-mono ${ui.td}`}>{spec.file}</td>
                    <td className={ui.td}>{spec.oasVersion}</td>
                    <td className={ui.td}>{spec.title}</td>
                    <td className={ui.td}>{spec.version}</td>
                    <td className={ui.td}>{spec.operations}</td>
                    <td className={`font-mono ${ui.td}`}>{short(spec.specHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <NoReport context={context} />
      )}
      <ArtifactLinks context={context} kinds={["input-base", "input-head"]} />
      <p className="text-sm text-muted-foreground">
        New contracts make a new run (<code className="font-mono">drift run</code>), not a re-run.
      </p>
    </div>
  );
}

function DiffPanel({ context }: { context: InspectorContext }) {
  const { report } = context;
  const byKind = new Map<string, number>();
  for (const change of report?.changes ?? []) byKind.set(change.kind, (byKind.get(change.kind) ?? 0) + 1);
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const requests = report?.changes.filter((change) => change.direction === "request").length ?? 0;
  return (
    <div className="space-y-5">
      <Header id="diff" />
      <Executions engine={["diff"]} stages={context.stages} />
      {report ? (
        <>
          <Facts
            items={[
              ["Changes", report.changes.length],
              ["Request side", requests],
              ["Response side", report.changes.length - requests],
              ["Operations affected", report.corpus.coverage.affectedOperations],
            ]}
          />
          {kinds.length > 0 && (
            <Section title="By kind">
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {kinds.map(([kind, count]) => (
                  <li key={kind}>
                    <span className="font-mono text-xs">{kind}</span> × {count}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {context.run.mode === "server" && (
            <p className="text-sm">
              <Link className="text-primary hover:underline" href={`${runPath(context)}/diff`}>
                Contract diff, side by side
              </Link>
            </p>
          )}
        </>
      ) : (
        <NoReport context={context} />
      )}
    </div>
  );
}

function CorpusPanel({ context }: { context: InspectorContext }) {
  const { report } = context;
  const corpus = report?.corpus;
  return (
    <div className="space-y-5">
      <Header id="corpus" />
      <Executions engine={["corpus"]} stages={context.stages} />
      {corpus ? (
        <>
          <Facts
            items={[
              [
                "Traffic",
                corpus.source.kind === "none" ? "none" : `${corpus.source.kind} ${corpus.source.file ?? ""}`.trim(),
              ],
              ["Records read", corpus.recorded.read],
              ["Malformed", corpus.recorded.malformed],
              ["Unrouted (no matching operation)", corpus.recorded.unrouted],
              ["Out of scope (no change)", corpus.recorded.outOfScope],
              [
                "Kept after sampling",
                `${String(corpus.recorded.sampled)} (caps: ${String(corpus.recorded.perOperationCap)} per operation, ${String(corpus.recorded.totalCap)} in total)`,
              ],
              [
                "Synthetic samples",
                `${String(corpus.synthetic.generated)} generated, ${String(corpus.synthetic.discarded)} discarded (seed ${String(corpus.synthetic.seed)})`,
              ],
              ["Redacted", `${String(corpus.redaction.values)} values in ${String(corpus.redaction.samples)} samples`],
              [
                "Coverage",
                `${String(corpus.coverage.withRecordedSamples)} of ${String(corpus.coverage.affectedOperations)} affected operations reached by recorded traffic`,
              ],
            ]}
          />
          {corpus.recorded.malformedExamples.length > 0 && (
            <Section title="Malformed lines (reasons only, never the content)">
              <ul className="text-sm">
                {corpus.recorded.malformedExamples.map((example) => (
                  <li key={example.line}>
                    line {example.line}: {example.reason}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <NoReport context={context} />
      )}
      <Diagnostics items={diagnosticsOf(report, "corpus")} />
      <ArtifactLinks context={context} kinds={["input-traffic"]} />
      <RerunStageForm context={context} stage="corpus" />
    </div>
  );
}

function VerifyPanel({ context }: { context: InspectorContext }) {
  const { report } = context;
  const statuses = new Map<string, number>();
  let checkedRecorded = 0;
  let checkedSynthetic = 0;
  let failedRecorded = 0;
  let failedSynthetic = 0;
  let unknown = 0;
  for (const change of report?.changes ?? []) {
    statuses.set(change.evidence.status, (statuses.get(change.evidence.status) ?? 0) + 1);
    checkedRecorded += change.evidence.checked.recorded;
    checkedSynthetic += change.evidence.checked.synthetic;
    failedRecorded += change.evidence.failed.recorded;
    failedSynthetic += change.evidence.failed.synthetic;
    unknown += change.evidence.unknown;
  }
  return (
    <div className="space-y-5">
      <Header id="verify" />
      <Executions engine={["verify"]} stages={context.stages} />
      {report ? (
        <>
          <Facts
            items={[
              ["Changes with failing evidence", statuses.get("failing") ?? 0],
              ["Reached, none failed", statuses.get("passing") ?? 0],
              ["Not reached by any sample", statuses.get("no_samples") ?? 0],
              ["Not verifiable by samples", statuses.get("not_verifiable") ?? 0],
              ["Sample checks (recorded / synthetic)", `${String(checkedRecorded)} / ${String(checkedSynthetic)}`],
              ["Failures (recorded / synthetic)", `${String(failedRecorded)} / ${String(failedSynthetic)}`],
              ["Unknown (failure at a redacted value)", unknown],
              [
                "Old contract already rejects",
                `${String(report.nonConformance.requests)} recorded requests, ${String(report.nonConformance.responses)} responses`,
              ],
            ]}
          />
          {report.unattributed.length > 0 && (
            <Section title="Failures no change explains">
              <ul className="text-sm">
                {report.unattributed.map((item) => (
                  <li key={`${item.operation}:${item.direction}`}>
                    <span className="font-mono">{item.operation}</span> ({item.direction}): {item.count} samples
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <NoReport context={context} />
      )}
      <Diagnostics items={diagnosticsOf(report, "verify")} />
      <RerunStageForm context={context} stage="verify" />
    </div>
  );
}

function ClassifyPanel({ context }: { context: InspectorContext }) {
  const { report } = context;
  const escalated = report?.changes.filter((change) => change.escalation !== undefined).length ?? 0;
  return (
    <div className="space-y-5">
      <Header id="classify" />
      <Executions engine={["classify"]} stages={context.stages} />
      {report ? (
        <Facts
          items={[
            [
              "BREAKING",
              <span key="b" className="text-breaking">
                {report.summary.breaking}
              </span>,
            ],
            [
              "RISKY",
              <span key="r" className="text-risky">
                {report.summary.risky}
              </span>,
            ],
            [
              "SAFE",
              <span key="s" className="text-safe">
                {report.summary.safe}
              </span>,
            ],
            ["Suppressed", report.summary.suppressed],
            ["Escalated by policy", escalated],
            ["Rules", `${report.rules.version} (${short(report.rules.hash)})`],
            ["Policy hash", short(report.policy.hash)],
            ["Fails on", report.policy.failOn],
          ]}
        />
      ) : (
        <NoReport context={context} />
      )}
      <Diagnostics items={diagnosticsOf(report, "classify")} />
      <RerunStageForm context={context} stage="classify" />
    </div>
  );
}

function ReportPanel({ context }: { context: InspectorContext }) {
  const { report, run } = context;
  return (
    <div className="space-y-5">
      <Header id="report" />
      {run.error !== undefined && (
        <p role="alert" className={ui.error}>
          The run failed ({run.error.category}): {run.error.message}
        </p>
      )}
      {report ? (
        <Facts
          items={[
            [
              "Gate",
              <span key="g" className={report.gate.passed ? "text-safe" : "text-breaking"}>
                {report.gate.passed ? "passed" : "failed"} (fails on {report.gate.failOn})
              </span>,
            ],
            ["Recommended version bump", report.semver],
            ["Engine", `${report.engine.name} ${report.engine.version}`],
            ["Cached stages", report.stages.filter((stage) => stage.cached).length],
          ]}
        />
      ) : (
        <NoReport context={context} />
      )}
      <Diagnostics items={diagnosticsOf(report, "report")} />
      <ArtifactLinks context={context} kinds={["report-json", "report-md", "report-html", "report-sarif"]} />
      <RerunStageForm context={context} stage="report" />
    </div>
  );
}

/** Every node's inspector, rendered on the server. */
export function inspectorPanels(context: InspectorContext): Record<CanvasStageId, ReactNode> {
  return {
    ingest: <IngestPanel context={context} />,
    diff: <DiffPanel context={context} />,
    corpus: <CorpusPanel context={context} />,
    verify: <VerifyPanel context={context} />,
    classify: <ClassifyPanel context={context} />,
    report: <ReportPanel context={context} />,
  };
}
