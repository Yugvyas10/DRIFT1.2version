import type { Metadata } from "next";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { db } from "@/server/context";
import { pageActor, pageUser } from "@/server/page";
import { listAudit } from "@/server/services/audit";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "audit:read");
  if (!actor) {
    return (
      <Shell user={user} org={org} title="Audit log">
        <NotAllowed what="the audit log (it needs ADMIN or OWNER)" />
      </Shell>
    );
  }
  const entries = await listAudit(db, actor, 100);
  return (
    <Shell user={user} org={org} title="Audit log">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Security-relevant actions in this organisation, newest first. Entries cannot be changed or removed.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">Audit log</caption>
          <thead>
            <tr className="border-b border-border">
              {["When", "Action", "By", "Target"].map((heading) => (
                <th key={heading} scope="col" className={ui.th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} data-testid="audit" className="border-b border-border/60">
                <td className={ui.td}>
                  <time dateTime={entry.createdAt}>{entry.createdAt.replace("T", " ").slice(0, 19)} UTC</time>
                </td>
                <td className={`font-mono ${ui.td}`}>{entry.action}</td>
                <td className={`font-mono text-xs ${ui.td}`}>{entry.actor.user ?? entry.actor.key ?? ""}</td>
                <td className={`font-mono text-xs ${ui.td}`}>
                  {entry.target.type} {entry.target.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
