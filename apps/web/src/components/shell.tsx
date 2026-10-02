import Link from "next/link";
import type { ReactNode } from "react";
import { signOutEverywhereAction } from "@/app/actions";
import { SignOutButton } from "./auth-forms";
import { Logo } from "./logo";
import { ui } from "./ui";

/** The frame of every signed-in page: the logo, where you are, who you are, and the way out. */
export function Shell({
  user,
  org,
  title,
  children,
}: {
  user: { email: string };
  /** The organisation the page is about, for its navigation. */
  org?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-border/60 bg-background/70">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo className="size-7" />
            <span>DRIFT</span>
          </Link>
          {org !== undefined && (
            <nav aria-label="Organisation" className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link className="hover:text-foreground" href={`/dashboard/${org}`}>
                Projects
              </Link>
              <Link className="hover:text-foreground" href={`/settings/${org}/keys`}>
                API keys
              </Link>
              <Link className="hover:text-foreground" href={`/settings/${org}/members`}>
                Members
              </Link>
              <Link className="hover:text-foreground" href={`/settings/${org}/audit`}>
                Audit log
              </Link>
            </nav>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user.email}</span>
            <SignOutButton />
            <form action={signOutEverywhereAction}>
              <button type="submit" className={ui.buttonQuiet} title="Ends your sessions on every device">
                Sign out everywhere
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
    </>
  );
}

/** Shown when a member opens a page their role does not allow. */
export function NotAllowed({ what }: { what: string }) {
  return <p className={ui.panel}>Your role in this organisation does not include {what}.</p>;
}
