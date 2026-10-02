import type { Metadata } from "next";
import { createKeyAction, revokeKeyAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { NotAllowed, Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { db } from "@/server/context";
import { pageActor, pageUser } from "@/server/page";
import { listKeys } from "@/server/services/keys";
import { listProjects } from "@/server/services/projects";

export const metadata: Metadata = { title: "API keys" };

export default async function KeysPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "keys:read");
  if (!actor) {
    return (
      <Shell user={user} org={org} title="API keys">
        <NotAllowed what="API keys (it needs ADMIN or OWNER)" />
      </Shell>
    );
  }
  const [keys, projects] = await Promise.all([listKeys(db, actor), listProjects(db, actor)]);
  return (
    <Shell user={user} org={org} title="API keys">
      <p className="max-w-2xl text-sm text-muted-foreground">
        A key lets CI upload runs (<code className="font-mono">drift compare --upload</code>). DRIFT stores only a hash
        of each key, so a key is shown once, when it is created.
      </p>
      {keys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">API keys</caption>
            <thead>
              <tr className="border-b border-border">
                {["Name", "Key", "Project", "Permissions", "Last used", ""].map((heading) => (
                  <th key={heading} scope="col" className={ui.th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} data-testid="key" className="border-b border-border/60">
                  <td className={ui.td}>{key.name}</td>
                  <td className={`font-mono ${ui.td}`}>{key.prefix}…</td>
                  <td className={ui.td}>{key.project ?? "all"}</td>
                  <td className={`font-mono text-xs ${ui.td}`}>{key.permissions.join(", ")}</td>
                  <td className={ui.td}>{key.lastUsedAt?.replace("T", " ").slice(0, 16) ?? "never"}</td>
                  <td className={ui.td}>
                    {key.revokedAt !== undefined ? (
                      <span className="text-breaking">revoked</span>
                    ) : (
                      can(actor, "keys:write") && (
                        <form action={revokeKeyAction.bind(null, org, key.id)}>
                          <button type="submit" className={ui.buttonQuiet}>
                            Revoke
                          </button>
                        </form>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {can(actor, "keys:write") && (
        <section aria-labelledby="new-key" className={ui.panel}>
          <h2 id="new-key" className="font-semibold">
            Create a key
          </h2>
          <div className="mt-4 max-w-md">
            <ActionForm action={createKeyAction.bind(null, org)} submit="Create key" secretLabel="API key">
              <div>
                <label htmlFor="key-name" className={ui.label}>
                  Name
                </label>
                <input
                  id="key-name"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="GitHub Actions"
                  className={`mt-1 ${ui.input}`}
                />
              </div>
              <div>
                <label htmlFor="key-project" className={ui.label}>
                  Project
                </label>
                <select id="key-project" name="project" className={`mt-1 ${ui.input}`}>
                  <option value="">All projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.slug}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className={ui.label}>Permissions</legend>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissions" value="runs:write" defaultChecked /> Upload runs
                </label>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissions" value="runs:read" defaultChecked /> Read runs
                </label>
              </fieldset>
            </ActionForm>
          </div>
        </section>
      )}
    </Shell>
  );
}
