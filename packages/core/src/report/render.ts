import type { Report } from "@drift/report-schema";
import { renderConsole } from "./console.ts";
import { renderHtml } from "./html.ts";
import { renderJunit } from "./junit.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderSarif } from "./sarif.ts";

/** Stage 6 — Report (PLAN §4.6): every output format of a report. */
export const REPORT_FORMATS = ["console", "json", "html", "md", "sarif", "junit"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** File name used for each format when writing to a directory. */
export const REPORT_FILES: Record<ReportFormat, string> = {
  console: "drift-report.txt",
  json: "drift-report.json",
  html: "drift-report.html",
  md: "drift-report.md",
  sarif: "drift-report.sarif",
  junit: "drift-report.junit.xml",
};

export function renderReport(report: Report, format: ReportFormat, options: { color?: boolean } = {}): string {
  switch (format) {
    case "console":
      return renderConsole(report, { color: options.color ?? false });
    case "json":
      return `${JSON.stringify(report, null, 2)}\n`;
    case "html":
      return renderHtml(report);
    case "md":
      return renderMarkdown(report);
    case "sarif":
      return renderSarif(report);
    case "junit":
      return renderJunit(report);
  }
}
