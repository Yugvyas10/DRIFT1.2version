import type { Metadata } from "next";
import { MarketingShell, Topic } from "@/components/marketing-shell";

export const metadata: Metadata = { title: "About" };

/** Who builds DRIFT, and the rules it is built by (Q11). */
export default function AboutPage() {
  return (
    <MarketingShell title="About DRIFT">
      <Topic id="what" title="What it is">
        <p>
          DRIFT is an API contract compatibility gate for CI/CD, built as an engineering design and innovation project
          at the Vishwakarma Institute of Technology, Pune (EDI Group 4). It is in development.
        </p>
      </Topic>
      <Topic id="principles" title="How it is built">
        <ul className="list-disc space-y-2 pl-5">
          <li>BREAKING needs a failing sample. Missing evidence never produces SAFE.</li>
          <li>Synthetic evidence is always labelled as synthetic and counts for less.</li>
          <li>Secrets and personal data in traffic are redacted by default, before anything is stored.</li>
          <li>
            No hand-written performance or accuracy numbers: measured ones come from the benchmark package and are
            published in <code className="font-mono">docs/EVALUATION.md</code>.
          </li>
          <li>Nothing simulated is shown as real; a demonstration organisation, if present, is labelled DEMO.</li>
        </ul>
      </Topic>
      <Topic id="team" title="Team">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="font-medium">Prathamesh Yewale</dt>
          <dd className="text-muted-foreground">
            Web UI: run canvas, inspector, diff view, design system, accessibility
          </dd>
          <dt className="font-medium">Yug Vyas</dt>
          <dd className="text-muted-foreground">Security: authentication, roles, API keys, threat model</dd>
          <dt className="font-medium">Tanishq Chavan</dt>
          <dd className="text-muted-foreground">Platform: database, ingestion API, storage, worker, live events</dd>
          <dt className="font-medium">Pruthvi Gangapure</dt>
          <dd className="text-muted-foreground">Engine rules and reports, CLI, GitHub Action, CI, benchmarks</dd>
        </dl>
      </Topic>
    </MarketingShell>
  );
}
