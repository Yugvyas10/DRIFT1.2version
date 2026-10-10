import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitationAction, createOrgAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { db } from "@/server/context";
import { pageUser } from "@/server/page";
import { listOrgs } from "@/server/services/orgs";

export const metadata: Metadata = { title: "Organisations" };

export default async function DashboardPage() {
  const user = await pageUser();
  const orgs = await listOrgs(db, user.userId);
  return (
    <Shell user={user} title="Your organisations">
      {orgs.length === 0 ? (
        <p className="text-muted-foreground">
          You are not in an organisation yet. Create one, or join one with an invitation.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <li key={org.id} className={ui.panel}>
              <Link className="font-semibold hover:text-primary" href={`/dashboard/${org.slug}`}>
                {org.name}
              </Link>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {org.slug} · {org.role}
              </p>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="new-org" className={ui.panel}>
        <h2 id="new-org" className="font-semibold">
          Create an organisation
        </h2>
        <div className="mt-4 max-w-md">
          <ActionForm action={createOrgAction} submit="Create organisation">
            <div>
              <label htmlFor="org-name" className={ui.label}>
                Name
              </label>
              <input id="org-name" name="name" required maxLength={100} className={`mt-1 ${ui.input}`} />
            </div>
            <div>
              <label htmlFor="org-slug" className={ui.label}>
                Slug
              </label>
              <input
                id="org-slug"
                name="slug"
                required
                pattern="[a-z0-9][a-z0-9\-]{0,62}"
                placeholder="acme"
                className={`mt-1 font-mono ${ui.input}`}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Lower-case letters, digits and hyphens. It appears in URLs.
              </p>
            </div>
          </ActionForm>
        </div>
      </section>
      <section aria-labelledby="join-org" className={ui.panel}>
        <h2 id="join-org" className="font-semibold">
          Join with an invitation
        </h2>
        <div className="mt-4 max-w-md">
          <ActionForm action={acceptInvitationAction} submit="Join">
            <div>
              <label htmlFor="invitation-token" className={ui.label}>
                Invitation token
              </label>
              <input id="invitation-token" name="token" required className={`mt-1 font-mono ${ui.input}`} />
            </div>
          </ActionForm>
        </div>
      </section>
    </Shell>
  );
}
