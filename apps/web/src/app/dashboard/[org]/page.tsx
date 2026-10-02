import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createProjectAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Shell } from "@/components/shell";
import { ui } from "@/components/ui";
import { can } from "@/server/auth/actor";
import { db } from "@/server/context";
import { pageActor, pageUser } from "@/server/page";
import { listProjects } from "@/server/services/projects";

export const metadata: Metadata = { title: "Projects" };

export default async function OrgPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await pageUser();
  const actor = await pageActor(org, "projects:read");
  if (!actor) notFound();
  const projects = await listProjects(db, actor);
  return (
    <Shell user={user} org={org} title="Projects">
      {projects.length === 0 ? (
        <p className="text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className={ui.panel}>
              <Link className="font-semibold hover:text-primary" href={`/dashboard/${org}/${project.slug}`}>
                {project.name}
              </Link>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {project.slug}
                {project.repo !== undefined && ` · ${project.repo}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {can(actor, "projects:write") && (
        <section aria-labelledby="new-project" className={ui.panel}>
          <h2 id="new-project" className="font-semibold">
            Create a project
          </h2>
          <div className="mt-4 max-w-md">
            <ActionForm action={createProjectAction.bind(null, org)} submit="Create project">
              <div>
                <label htmlFor="project-name" className={ui.label}>
                  Name
                </label>
                <input id="project-name" name="name" required maxLength={100} className={`mt-1 ${ui.input}`} />
              </div>
              <div>
                <label htmlFor="project-slug" className={ui.label}>
                  Slug
                </label>
                <input
                  id="project-slug"
                  name="slug"
                  required
                  pattern="[a-z0-9][a-z0-9\-]{0,62}"
                  placeholder="orders-api"
                  className={`mt-1 font-mono ${ui.input}`}
                />
              </div>
              <div>
                <label htmlFor="project-repo" className={ui.label}>
                  GitHub repository (optional)
                </label>
                <input
                  id="project-repo"
                  name="repo"
                  placeholder="owner/name"
                  className={`mt-1 font-mono ${ui.input}`}
                />
              </div>
            </ActionForm>
          </div>
        </section>
      )}
    </Shell>
  );
}
