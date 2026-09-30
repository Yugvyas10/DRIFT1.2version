import { createHash } from "node:crypto";
import type { ClassifiedChange, Report, Severity } from "@drift/report-schema";
import { bySeverity, evidenceSummary, gateLine, omittedBody, plural, SEVERITIES, where } from "./common.ts";

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The DRIFT palette (INVENTORY §3): navy background, teal accent. System fonts only: no external assets.
const STYLE = `
:root{color-scheme:dark light;--bg:#0b1220;--panel:#0f172a;--line:#2a3a5e;--text:#e2e8f0;--muted:#94a3b8;--accent:#2dd4bf;--breaking:#f87171;--risky:#fbbf24;--safe:#34d399}
@media (prefers-color-scheme:light){:root{--bg:#f8fafc;--panel:#fff;--line:#cbd5e1;--text:#0f172a;--muted:#475569;--accent:#0f766e;--breaking:#b91c1c;--risky:#a16207;--safe:#047857}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 12px}
.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}.card b{display:block;font-size:1.6rem}
.BREAKING{color:var(--breaking)}.RISKY{color:var(--risky)}.SAFE{color:var(--safe)}.gate{font-weight:600}
details{background:var(--panel);border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:10px 12px}summary{cursor:pointer}
code,pre{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}pre{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;white-space:pre-wrap;word-break:break-word}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:10px 0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
footer{margin-top:40px;font-size:.85rem}
`.trim();

const STYLE_HASH = createHash("sha256").update(STYLE).digest("base64");

function change(item: ClassifiedChange): string {
  const e = escapeHtml;
  const [example] = item.evidence.examples;
  const rows: [string, string][] = [
    ["Operation", `<code>${e(item.operation)}</code> (${e(item.direction)})`],
    ["Kind", `<code>${e(item.kind)}</code>`],
    ["Where", `<code>${e(where(item))}</code>`],
    ["Rule", `<code>${e(item.ruleId)}</code>: ${e(item.rationale)}`],
    ["Evidence", e(evidenceSummary(item))],
    ["Change id", `<code>${e(item.id)}</code>`],
  ];
  if (item.escalation) rows.push(["Escalated", e(item.escalation)]);
  if (item.suppression)
    rows.push(["Suppressed", `until ${e(item.suppression.expiresAt)}: ${e(item.suppression.reason)}`]);
  let body = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  if (example) {
    const origin = example.line === undefined ? example.origin : `${example.origin}, line ${String(example.line)}`;
    body += `<p class="muted">Failing sample (${e(origin)}, redacted)</p><pre>${e(JSON.stringify(example.payload, null, 2))}</pre>`;
    const omitted = omittedBody(example);
    if (omitted) body += `<p class="muted">${e(omitted)}</p>`;
    body += `<pre>${e(example.errors.map((error) => `${error.pointer} ${error.message}`).join("\n"))}</pre>`;
  }
  return `<details${item.severity === "BREAKING" ? " open" : ""}><summary><span class="${item.severity}">${item.severity}</span> ${e(item.message)}</summary>${body}</details>`;
}

/**
 * The HTML report (PLAN §4.6): one self-contained file with no scripts and no external assets. Every value is
 * escaped, and the Content-Security-Policy allows nothing but the page's own stylesheet, by hash.
 * Template owner: P1 (visual design); rendering: P4.
 */
export function renderHtml(report: Report): string {
  const e = escapeHtml;
  const s = report.summary;
  const cards: [string, number, Severity | ""][] = [
    ["BREAKING", s.breaking, "BREAKING"],
    ["RISKY", s.risky, "RISKY"],
    ["SAFE", s.safe, "SAFE"],
    ["Suppressed", s.suppressed, ""],
  ];
  const sections = SEVERITIES.map((severity) => {
    const changes = bySeverity(report, severity);
    return changes.length === 0
      ? ""
      : `<section><h2 class="${severity}">${severity} (${String(changes.length)})</h2>${changes.map(change).join("")}</section>`;
  }).join("");
  const corpus = report.corpus;
  const traffic =
    corpus.source.kind === "none"
      ? "No traffic: evidence comes from synthetic samples only."
      : `Traffic ${e(corpus.source.file ?? corpus.source.kind)}: ${String(corpus.recorded.read)} records read, ${String(corpus.recorded.malformed)} malformed, ${String(corpus.recorded.sampled)} kept.`;
  const unattributed = report.unattributed
    .map((item) => `<li><code>${e(item.operation)}</code> ${e(item.direction)}: ${plural(item.count, "sample")}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${STYLE_HASH}'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>DRIFT report</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>DRIFT contract report</h1>
<p class="gate ${report.gate.passed ? "SAFE" : "BREAKING"}">Gate ${e(gateLine(report))}</p>
<p class="muted"><code>${e(report.base.file)}</code> (${e(report.base.version)}) → <code>${e(report.head.file)}</code> (${e(report.head.version)}). ${traffic} ${String(corpus.synthetic.generated)} synthetic samples, marked as such.</p>
<div class="cards">${cards.map(([label, count, tone]) => `<div class="card"><b class="${tone}">${String(count)}</b>${label}</div>`).join("")}</div>
${sections}
${unattributed ? `<section><h2 class="RISKY">Unexplained failures</h2><p>Samples that fail under the new contract for a reason no detected change explains:</p><ul>${unattributed}</ul></section>` : ""}
${report.diagnostics.length > 0 ? `<section><h2>Notes</h2><ul>${report.diagnostics.map((d) => `<li>${e(d.level)} <code>${e(d.code)}</code> ${e(d.message)}</li>`).join("")}</ul></section>` : ""}
<footer class="muted">DRIFT ${e(report.engine.version)} · rules ${e(report.rules.version)} · <code>${e(report.format)}</code></footer>
</main>
</body>
</html>
`;
}
