import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { changeRoleAction, inviteAction, removeMemberAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { db } from "@/server/context";
import { pageActor, pageUser } from "@/server/page";
import { listMembers } from "@/server/services/members";

export const metadata: Metadata = { title: "Members" };

const ROLES = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "members:read");
  if (!actor) notFound();
  const members = await listMembers(db, actor);
  const manage = can(actor, "members:manage");
  return (
    <Shell user={user} org={org} title="Members">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">Members of this organisation</caption>
          <thead>
            <tr className="border-b border-border">
              {["Email", "Role", ""].map((heading) => (
                <th key={heading} scope="col" className={ui.th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} data-testid="member" className="border-b border-border/60">
                <td className={ui.td}>{member.email}</td>
                <td className={ui.td}>
                  {manage ? (
                    <ActionForm action={changeRoleAction.bind(null, org, member.userId)} submit="Change" quiet>
                      <label className="sr-only" htmlFor={`role-${member.userId}`}>
                        Role of {member.email}
                      </label>
                      <select
                        id={`role-${member.userId}`}
                        name="role"
                        defaultValue={member.role}
                        className="mr-2 rounded-md border border-border bg-background-2 px-2 py-1 text-sm"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                  ) : (
                    member.role
                  )}
                </td>
                <td className={ui.td}>
                  {(manage || member.userId === user.userId) && (
                    <ActionForm
                      action={removeMemberAction.bind(null, org, member.userId)}
                      submit={member.userId === user.userId ? "Leave" : "Remove"}
                      quiet
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manage && (
        <section aria-labelledby="invite" className={ui.panel}>
          <h2 id="invite" className="font-semibold">
            Invite someone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            DRIFT does not send email yet. Pass the token on yourself; it works for that email address only, for seven
            days.
          </p>
          <div className="mt-4 max-w-md">
            <ActionForm action={inviteAction.bind(null, org)} submit="Create invitation" secretLabel="invitation token">
              <div>
                <label htmlFor="invite-email" className={ui.label}>
                  Email
                </label>
                <input id="invite-email" name="email" type="email" required className={`mt-1 ${ui.input}`} />
              </div>
              <div>
                <label htmlFor="invite-role" className={ui.label}>
                  Role
                </label>
                <select id="invite-role" name="role" defaultValue="MEMBER" className={`mt-1 ${ui.input}`}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
          </div>
        </section>
      )}
    </Shell>
  );
}
