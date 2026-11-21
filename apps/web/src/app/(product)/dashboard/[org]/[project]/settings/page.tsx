import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePolicyAction, deleteSuppressionAction, setPolicyAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ActionWizard } from "@/components/action-wizard";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { env } from "@/env";
import { can } from "@/server/auth/actor";
import { db } from "@/server/context";
import { pageActor, pageUser } from "@/server/page";
import { getProjectPolicy } from "@/server/services/policies";
import { listProjects } from "@/server/services/projects";
import { listSuppressions } from "@/server/services/suppressions";

export const metadata: Metadata = { title: "Project settings" };

/** A project's policy, its suppressions and the GitHub Action setup (PLAN M7). */
export default async function ProjectSettingsPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "projects:read");
  if (!actor) notFound();
  const found = (await listProjects(db, actor)).find((candidate) => candidate.slug === project);
  if (!found) notFound();
  const [policy, suppressions] = await Promise.all([
    getProjectPolicy(db, actor, project),
    listSuppressions(db, actor, project),
  ]);
  const canEditPolicy = actor.kind === "user" && can(actor, "projects:write");
  const canSuppress = actor.kind === "user" && can(actor, "suppressions:write");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Shell user={user} org={org} title={`Settings of ${found.name}`}>
      <p className="text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href={`/dashboard/${org}/${project}`}>
          ← Runs of {project}
        </Link>
      </p>

      <section aria-labelledby="policy" className={`${ui.panel} space-y-3`}>
        <h2 id="policy" className="font-semibold">
          Policy
        </h2>
        <p className="text-sm text-muted-foreground">
          A drift-policy/v1 document: which label fails the gate, escalations (SAFE to RISKY) and suppressions (each
          with a reason and an expiry). Server-side runs without a policy of their own use it; a run&apos;s own{" "}
          <code className="font-mono">--policy</code> wins.
        </p>
        {policy ? (
          <>
            <p className="text-sm" data-testid="policy-hash">
              Current policy, saved {policy.updatedAt.replace("T", " ").slice(0, 16)} UTC, hash{" "}
              <span className="font-mono">{policy.hash.slice(0, 12)}</span>
            </p>
            <pre tabIndex={0} className="overflow-x-auto rounded-md bg-background-2 p-3 font-mono text-xs">
              {JSON.stringify(policy.document, null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-sm">No project policy: the default applies (fail on BREAKING).</p>
        )}
        {canEditPolicy && (
          <div className="max-w-2xl space-y-3">
            <ActionForm action={setPolicyAction.bind(null, org, project)} submit="Save policy">
              <div>
                <label htmlFor="policy-text" className={ui.label}>
                  Policy (YAML or JSON)
                </label>
                <textarea
                  id="policy-text"
                  name="policy"
                  rows={10}
                  required
                  className={`${ui.input} font-mono text-xs`}
                  defaultValue={
                    policy ? JSON.stringify(policy.document, null, 2) : "format: drift-policy/v1\nfailOn: breaking\n"
                  }
                />
              </div>
            </ActionForm>
            {policy && (
              <form action={deletePolicyAction.bind(null, org, project)}>
                <button type="submit" className={ui.buttonQuiet}>
                  Remove the policy
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="suppressions" className={`${ui.panel} space-y-3`}>
        <h2 id="suppressions" className="font-semibold">
          Suppressions
        </h2>
        <p className="text-sm text-muted-foreground">
          Accepted changes, by change id. They stay in every report, marked as suppressed, and do not count towards the
          gate of server-side runs until they expire. Suppress a change from its page in a run.
        </p>
        {suppressions.length === 0 ? (
          <p className="text-sm">None.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Suppressions of this project</caption>
              <thead>
                <tr className="border-b border-border">
                  {["Change", "Reason", "Until", "Added", ""].map((heading) => (
                    <th key={heading} scope="col" className={ui.th}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppressions.map((suppression) => {
                  const expired = suppression.expiresAt.slice(0, 10) < today;
                  return (
                    <tr key={suppression.id} data-testid="suppression" className="border-b border-border/60">
                      <td className={`font-mono ${ui.td}`}>{suppression.changeId}</td>
                      <td className={ui.td}>{suppression.reason}</td>
                      <td className={ui.td}>
                        {suppression.expiresAt.slice(0, 10)}
                        {expired && <span className="block text-xs text-risky">expired</span>}
                      </td>
                      <td className={ui.td}>{suppression.createdAt.slice(0, 10)}</td>
                      <td className={ui.td}>
                        {canSuppress && (
                          <form action={deleteSuppressionAction.bind(null, org, project, suppression.id)}>
                            <button type="submit" className={ui.buttonQuiet}>
                              Remove
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="setup" className={`${ui.panel} space-y-3`}>
        <h2 id="setup" className="font-semibold">
          Set up the GitHub Action
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose the options; the workflow file below follows them. Nothing leaves your browser.
        </p>
        <ActionWizard
          defaults={{
            project,
            appUrl: env.APP_URL,
            ...(found.specPath === undefined ? {} : { specPath: found.specPath }),
          }}
        />
      </section>
    </Shell>
  );
}
