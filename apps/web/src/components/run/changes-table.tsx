import { evidenceSummary } from "@drift/core";
import type { ClassifiedChange, Report } from "@drift/report-schema";
import Link from "next/link";
import { ui } from "../ui";

/** How many rows the table shows at once; the rest are a link away (a large API can have thousands). */
export const CHANGES_PAGE_SIZE = 200;

export type ChangeFilter = "all" | "breaking" | "risky" | "safe" | "suppressed";

export function isChangeFilter(value: string | undefined): value is ChangeFilter {
  return value === "all" || value === "breaking" || value === "risky" || value === "safe" || value === "suppressed";
}

const LABEL_STYLE = { BREAKING: "text-breaking", RISKY: "text-risky", SAFE: "text-safe" } as const;

export function matches(change: ClassifiedChange, filter: ChangeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "suppressed") return change.suppression !== undefined;
  return change.suppression === undefined && change.severity.toLowerCase() === filter;
}

/** The run's changes from its report, filtered by label, each linking to its detail page. */
export function ChangesTable({
  report,
  basePath,
  filter,
  page,
}: {
  report: Report;
  /** The run page's path; filters and pages are query parameters on it. */
  basePath: string;
  filter: ChangeFilter;
  page: number;
}) {
  const counts: Record<ChangeFilter, number> = {
    all: report.changes.length,
    breaking: report.summary.breaking,
    risky: report.summary.risky,
    safe: report.summary.safe,
    suppressed: report.summary.suppressed,
  };
  const shown = report.changes.filter((change) => matches(change, filter));
  const pages = Math.max(1, Math.ceil(shown.length / CHANGES_PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), pages);
  const rows = shown.slice((current - 1) * CHANGES_PAGE_SIZE, current * CHANGES_PAGE_SIZE);
  const href = (next: { filter?: ChangeFilter; page?: number }) => {
    const query = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") query.set("label", f);
    if ((next.page ?? 1) > 1) query.set("page", String(next.page));
    const text = query.toString();
    return `${basePath}${text === "" ? "" : `?${text}`}#changes`;
  };
  return (
    <section aria-labelledby="changes" className="space-y-3">
      <h2 id="changes" className="font-semibold">
        Changes
      </h2>
      <nav aria-label="Filter changes by label" className="flex flex-wrap gap-2 text-sm">
        {(["all", "breaking", "risky", "safe", "suppressed"] as const).map((option) => (
          <Link
            key={option}
            href={href({ filter: option })}
            aria-current={option === filter ? "page" : undefined}
            className={`rounded-md border px-2 py-1 ${option === filter ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {option} ({counts[option]})
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes with this label.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Changes of this run</caption>
            <thead>
              <tr className="border-b border-border">
                {["Label", "Operation", "Change", "Evidence"].map((heading) => (
                  <th key={heading} scope="col" className={ui.th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((change) => (
                <tr key={change.id} data-testid="change" className="border-b border-border/60 align-top">
                  <td className={`${ui.td} ${LABEL_STYLE[change.severity]}`}>
                    {change.severity}
                    {change.suppression !== undefined && (
                      <span className="block text-xs text-muted-foreground">suppressed</span>
                    )}
                  </td>
                  <td className={`font-mono text-xs ${ui.td}`}>
                    {change.operation} <span className="text-muted-foreground">({change.direction})</span>
                  </td>
                  <td className={ui.td}>
                    <Link className="hover:text-primary" href={`${basePath}/changes/${change.id}`}>
                      {change.message}
                    </Link>
                  </td>
                  <td className={`text-xs text-muted-foreground ${ui.td}`}>{evidenceSummary(change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pages of changes" className="flex items-center gap-3 text-sm">
          {current > 1 && <Link href={href({ page: current - 1 })}>Previous</Link>}
          <span className="text-muted-foreground">
            Page {current} of {pages}
          </span>
          {current < pages && <Link href={href({ page: current + 1 })}>Next</Link>}
        </nav>
      )}
    </section>
  );
}
