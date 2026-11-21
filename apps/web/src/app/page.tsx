import { Logo } from "@/components/logo";

/*
 * Marketing landing page. It describes the design only: no run results, numbers or customer
 * claims appear here, because none exist yet (CLAUDE.md: never present a stub as working).
 */

const LABELS = [
  {
    name: "BREAKING",
    colour: "text-breaking border-breaking/40 bg-breaking/10",
    summary: "Proven with evidence.",
    detail:
      "At least one concrete sample that the old contract accepts is rejected by the new one. The report shows the failing payload, with secrets redacted.",
  },
  {
    name: "RISKY",
    colour: "text-risky border-risky/40 bg-risky/10",
    summary: "Dangerous, not yet proven.",
    detail:
      "The change is structurally dangerous, but no failing sample was found. Missing evidence never turns into SAFE.",
  },
  {
    name: "SAFE",
    colour: "text-safe border-safe/40 bg-safe/10",
    summary: "Compatible by the rules.",
    detail: "The change is safe in its direction, such as a new optional request field or a new endpoint.",
  },
] as const;

const STAGES = [
  {
    name: "Ingest",
    detail:
      "Load OpenAPI 3.0 or 3.1 from YAML or JSON, report errors with file, line and column, resolve $refs without fetching remote URLs, and normalise both contracts.",
  },
  {
    name: "Diff",
    detail:
      "Record every change with its location and direction: what the server accepts (request) or what it returns (response).",
  },
  {
    name: "Corpus",
    detail:
      "Stream recorded traffic with secrets redacted by default, or generate seeded, clearly labelled samples from the old contract.",
  },
  {
    name: "Verify",
    detail:
      "Validate samples against both contracts. A sample the old contract accepts and the new one rejects is evidence of a break.",
  },
  {
    name: "Classify",
    detail:
      "Apply versioned rules to each change and its evidence, with a rule id, a rationale and a confidence derived from coverage.",
  },
  {
    name: "Report & Gate",
    detail:
      "Write console, JSON, HTML, Markdown and SARIF reports, and exit non-zero so the pipeline blocks the merge.",
  },
] as const;

const TEAM = ["Prathamesh Yewale", "Yug Vyas", "Tanishq Chavan", "Pruthvi Gangapure"] as const;

export default function HomePage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo className="size-7" />
            <span>DRIFT</span>
          </a>
          <ul className="flex items-center gap-6 text-sm text-muted-foreground">
            <li className="hidden sm:block">
              <a className="hover:text-foreground" href="#labels">
                Labels
              </a>
            </li>
            <li className="hidden sm:block">
              <a className="hover:text-foreground" href="#how-it-works">
                How it works
              </a>
            </li>
            <li>
              <span className="rounded-full border border-risky/40 bg-risky/10 px-3 py-1 text-xs font-medium text-risky">
                In development
              </span>
            </li>
          </ul>
        </nav>
      </header>

      <main id="top">
        <section className="grid-bg relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 pt-24 pb-20 sm:pt-32">
            <p className="font-mono text-xs tracking-widest text-primary uppercase">
              API contract compatibility gate for CI/CD
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Block breaking API changes <span className="gradient-text">with evidence.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              DRIFT compares the old and new OpenAPI contract of a REST API inside your CI pipeline, checks recorded or
              generated traffic against both, and fails the merge only when it can show a concrete request or response
              that breaks.
            </p>

            <aside
              aria-label="Project status"
              className="glass-panel mt-10 max-w-2xl rounded-lg p-5 text-sm leading-relaxed"
            >
              <p className="font-medium text-risky">DRIFT is being rebuilt.</p>
              <p className="mt-1 text-muted-foreground">
                The engine is not available yet. This page describes the design, and nothing on it comes from a real
                run. Progress is tracked milestone by milestone in{" "}
                <code className="font-mono text-foreground">docs/PLAN.md</code>.
              </p>
            </aside>
          </div>
        </section>

        <div className="hairline mx-auto max-w-6xl" />

        <section id="labels" aria-labelledby="labels-heading" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <h2 id="labels-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Three labels, one rule: no evidence, no BREAKING.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every change gets exactly one label, with the rule that produced it and the reason.
          </p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {LABELS.map((label) => (
              <li key={label.name} className="glass-panel rounded-lg p-6">
                <span
                  className={`inline-block rounded-md border px-2.5 py-1 font-mono text-xs font-semibold ${label.colour}`}
                >
                  {label.name}
                </span>
                <p className="mt-4 font-medium">{label.summary}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{label.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-24">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How DRIFT works
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Six stages, each a pure function with a typed, content-addressed output, so any stage can be re-run with new
            inputs while reusing the stages before it.
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((stage, index) => (
              <li key={stage.name} className="glass-panel rounded-lg p-6">
                <p className="font-mono text-xs text-primary">Stage {index + 1}</p>
                <h3 className="mt-2 font-semibold">{stage.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>DRIFT — EDI Group 4, Vishwakarma Institute of Technology, Pune</p>
          <p>{TEAM.join(" · ")}</p>
        </div>
      </footer>
    </>
  );
}
