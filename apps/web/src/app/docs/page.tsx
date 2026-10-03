import type { Metadata } from "next";
import Link from "next/link";
import { Code, MarketingShell, Topic } from "@/components/marketing-shell";

export const metadata: Metadata = { title: "Docs" };

/** How to use DRIFT (Q11): the CLI, the GitHub Action and the platform. Full references live in the repository. */
export default function DocsPage() {
  return (
    <MarketingShell title="Using DRIFT">
      <p className="text-muted-foreground">
        DRIFT compares two versions of an OpenAPI 3.0 or 3.1 contract and labels every change. A change is{" "}
        <strong className="text-breaking">BREAKING</strong> only when a sample that the old contract accepts fails
        against the new one; <strong className="text-risky">RISKY</strong> when it is structurally dangerous but
        unproven; <strong className="text-safe">SAFE</strong> when it is compatible by the rules. Missing evidence never
        makes a change SAFE.
      </p>

      <nav aria-label="On this page" className="text-sm">
        <ul className="flex flex-wrap gap-4 text-primary">
          <li>
            <a href="#cli">The drift command</a>
          </li>
          <li>
            <a href="#action">GitHub Action</a>
          </li>
          <li>
            <a href="#platform">The platform</a>
          </li>
          <li>
            <a href="#traffic">Traffic</a>
          </li>
          <li>
            <a href="#policy">Policy</a>
          </li>
          <li>
            <a href="#api">REST API</a>
          </li>
        </ul>
      </nav>

      <Topic id="cli" title="The drift command">
        <p>Compare two contracts on your machine. The exit code is the gate: 0 passed, 1 failed, 2 bad input.</p>
        <Code>{`drift validate openapi.yaml
drift compare --base origin/main:openapi.yaml --head openapi.yaml --traffic traffic.jsonl
drift compare --base old.yaml --head new.yaml --format console,json,html,md,sarif --out reports
drift explain <change-id> --report reports/drift-report.json`}</Code>
        <p className="text-sm text-muted-foreground">
          Stage outputs are cached in <code className="font-mono">.drift/cache</code>, keyed by the hash of their
          inputs, so a second run with new traffic recomputes only what depends on it.
        </p>
      </Topic>

      <Topic id="action" title="GitHub Action">
        <p>
          The Action runs the same comparison on every pull request, writes the report to the job summary, keeps one
          comment on the pull request up to date, and fails the check when the gate fails. Make the check required in
          branch protection to block merges. A project&apos;s settings page generates the workflow file.
        </p>
        <Code>{`- uses: actions/checkout@v7
- uses: Yugvyas10/DRIFT1.2version/packages/github-action@<commit-sha>
  with:
    spec: openapi.yaml
    # traffic: traffic.jsonl
    # fail-on: risky`}</Code>
      </Topic>

      <Topic id="platform" title="The platform">
        <p>
          Sign in, create an organisation, a project and an API key (shown once). Then either upload a run you compared
          in CI, or let the platform compare: its worker runs the engine, and the run canvas shows each stage live.
        </p>
        <Code>{`export DRIFT_API_KEY=drift_…
drift compare --base old.yaml --head new.yaml --upload --project <slug> --api-url <url>
drift run --base old.yaml --head new.yaml --traffic traffic.jsonl --project <slug> --api-url <url>
drift rerun <run-id> --traffic newer.jsonl --api-url <url>`}</Code>
        <p className="text-sm text-muted-foreground">
          A re-run is a child run with the same contracts: stages whose inputs did not change come from the
          organisation&apos;s cache. From the run canvas you can re-run from Corpus (new traffic or seed), Verify (seed)
          or Classify (policy, rules, fail-on).
        </p>
      </Topic>

      <Topic id="traffic" title="Traffic">
        <p>
          Recorded traffic is evidence. DRIFT reads <code className="font-mono">drift-traffic/v1</code> JSONL (one
          request and response per line) or HAR files, and redacts secrets and personal data before using them: tokens,
          passwords, keys, email addresses, card numbers. A failure at a redacted value counts as unknown, never as a
          failure. Without traffic, DRIFT generates samples from the old contract and marks them as synthetic.
        </p>
      </Topic>

      <Topic id="policy" title="Policy">
        <p>
          A <code className="font-mono">drift-policy/v1</code> file sets which label fails the gate, escalates SAFE
          changes to RISKY, and suppresses known changes. Every suppression needs a reason and an expiry date.
        </p>
        <Code>{`format: drift-policy/v1
failOn: breaking
suppressions:
  - changeId: 0123456789abcdef
    reason: Clients migrated before the release.
    expiresAt: 2026-12-31`}</Code>
      </Topic>

      <Topic id="api" title="REST API">
        <p>
          Every screen of the dashboard is backed by the REST API described in{" "}
          <code className="font-mono">apps/web/openapi/drift-api.yaml</code>. Call it with an API key (
          <code className="font-mono">Authorization: Bearer drift_…</code>). A run&apos;s events stream as Server-Sent
          Events from <code className="font-mono">GET /api/v1/runs/&#123;id&#125;/events</code>.
        </p>
        <p className="text-sm">
          <Link className="text-primary hover:underline" href="/login">
            Sign in to the dashboard
          </Link>
        </p>
      </Topic>
    </MarketingShell>
  );
}
